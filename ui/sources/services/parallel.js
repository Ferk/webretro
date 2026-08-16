/**
 * @param {any} context
 */
export function instrumentContext(context) {
	const TYPE_NUMBER = 1;
	const TYPE_STRING = 2;
	const TYPE_OBJECT = 3;
	const TYPE_ERROR  = 4;
	const RESPONSE = '-parallel-response-';
	const BUFFER_HEADER_SIZE = 12;

	const transferable = (obj) => {
		const instance = ArrayBuffer.isView(obj) ? obj.buffer : obj;
		const types = [MessagePort, globalThis.OffscreenCanvas, ArrayBuffer].filter(Boolean);
		if (types.map(type => type.name).includes(instance?.constructor.name))
			return instance;
		return null;
	};

	context['-ready-'] = () => { return 0; };
	context['-port-'] = (port) => { port.onmessage = onmessage; return 0; };

	return async (message) => {
		const name = message.data.name;
		const args = message.data.args;
		const sync = message.data.sync;
		const id = message.data.id;
		const sab = sync ? args.shift() : null;

		let result = null;
		let is_error = false;
		try {
			result = await context[name](...args);
		} catch(e) {
			result = e;
			is_error = true;
		}

		if (!sync) {
			const target = message.currentTarget || self;
			const response = {
				type: RESPONSE,
				id,
				result: is_error ? { name: result.name, message: result.message, stack: result.stack } : result,
				error: is_error,
			};
			const transfer = transferable(result);
			target.postMessage(response, transfer ? [transfer] : []);
			return;
		}

		const write = (type, encoded) => {
			if (sab.buffer.byteLength < BUFFER_HEADER_SIZE + encoded.byteLength) {
				type = TYPE_ERROR;
				encoded = new TextEncoder().encode(JSON.stringify({
					name: 'Error',
					message: 'Synchronous worker response is too large',
				}));
			}

			Atomics.store(sab, 1, type);
			Atomics.store(sab, 2, encoded.byteLength);
			new Uint8Array(sab.buffer).set(encoded, BUFFER_HEADER_SIZE);
		};

		switch (typeof result) {
			case 'number':
				Atomics.store(sab, 1, TYPE_NUMBER);
				Atomics.store(sab, 2, result);
				break;
			case 'string':
				const encoded_str = new TextEncoder().encode(result);
				write(TYPE_STRING, encoded_str);
				break;
			case 'object':
				const stringified = JSON.stringify(is_error
					? { name: result.name, message: result.message, stack: result.stack }
					: result);
				const encoded_obj = new TextEncoder().encode(stringified);
				write(is_error ? TYPE_ERROR : TYPE_OBJECT, encoded_obj);
				break;
		}

		Atomics.store(sab, 0, 1);
		Atomics.notify(sab, 0, 1);
	}
}

/**
 * @param {SharedArrayBuffer} sab
 * @returns {any}
 */
export function parseMessage(sab) {
	const TYPE_NUMBER = 1;
	const TYPE_STRING = 2;
	const TYPE_OBJECT = 3;
	const TYPE_ERROR  = 4;

	switch (sab[1]) {
		case TYPE_NUMBER:
			return sab[2];
		case TYPE_STRING:
			const str_buf = new Uint8Array(sab.buffer, 12, sab[2]).slice();
			return new TextDecoder().decode(str_buf);
		case TYPE_OBJECT:
			const obj_buf = new Uint8Array(sab.buffer, 12, sab[2]).slice();
			return JSON.parse(new TextDecoder().decode(obj_buf));
		case TYPE_ERROR:
			const err_buf = new Uint8Array(sab.buffer, 12, sab[2]).slice();
			const err_data = JSON.parse(new TextDecoder().decode(err_buf));
			const error = new Error(err_data.message);
			error.name = err_data.name;
			error.stack = err_data.stack;
			throw error;
	}
}

/**
 * @template T
 */
export default class Parallel {
	static #BUFFER_SIZE = 50 * 1024;

	/** @type {new() => T} */
	#cls = null;

	/** @type {boolean} */
	#sync = false;

	/** @type {(event: MessageEvent) => void} */
	#handler = false;

	/** @type {T} */
	#proxy = null;

	/** @type {Worker | MessagePort} */
	#worker = null;

	/** @type {Int32Array[]} */
	#buffers = [];

	/** @type {number} */
	#next_id = 1;

	/** @type {{ [id: number]: { resolve: (value: any) => void, reject: (error: Error) => void } }} */
	#pending = {};

	static #RESPONSE = '-parallel-response-';

	/**
	 * @param {new() => T} cls
	 * @param {Worker | MessagePort} worker
	 * @param {boolean} sync
	 * @param {(event: MessageEvent) => void} handler
	 */
	constructor(cls, sync, handler) {
		this.#cls = cls;
		this.#sync = sync;
		this.#handler = handler

		const instance = new this.#cls();
		this.#proxy = new Proxy(instance, {
			get: (_, name) => {
				if (instance[name]) {
					const parallel = this;
					return function() { return parallel.#call(name, [...arguments], sync); };
				}
				return Reflect.get(instance, ...arguments);
			}
		});
	}

	/**
	 * @param {string} name
	 * @param {string} script
	 * @returns {Promise<T>}
	 */
	async create(name, script) {
		if (!script)
			script = `onmessage = (${instrumentContext})(new (${this.#cls}));`;

		const blob = new Blob([script], { type: 'text/javascript' });
		this.#worker = new Worker(URL.createObjectURL(blob), { name });
		this.#worker.onmessage = (event) => this.#message(event);
		await this.#call('-ready-', [], false);
		return this.#proxy;
	}

	/**
	 * @param {MessagePort} port
	 * @returns {T}
	 */
	link(port) {
		this.#worker = port;
		this.#worker.onmessage = (event) => this.#message(event);
		return this.#proxy;
	}

	/**
	 * @returns {MessagePort | Promise<MessagePort>}
	 */
	open() {
		const channel = new MessageChannel();

		if (this.#sync) {
			this.#call('-port-', [channel.port1]);
			return channel.port2;
		}

		return this.#call('-port-', [channel.port1]).then(() => channel.port2);
	}

	/**
	 * @returns {void}
	 */
	close() {
		const worker = this.#worker;
		if (worker.terminate) worker.terminate();
		if (worker.close) worker.close();
	}

	/**
	 * @param {any} context
	 * @returns {MessagePort}
	 */
	static instrument(context) {
		const channel = new MessageChannel();
		channel.port1.onmessage = instrumentContext(context);
		return channel.port2;
	}

	/**
	 * @param {any} obj
	 * @returns {boolean}
	 */
	#transferable(obj) {
		const instance = ArrayBuffer.isView(obj) ? obj.buffer : obj;
		const types = [MessagePort, globalThis.OffscreenCanvas, ArrayBuffer].filter(Boolean);
		if (types.map(type => type.name).includes(instance?.constructor.name))
			return instance;
		return null;
	}

	/**
	 * @param {MessageEvent} event
	 * @returns {void}
	 */
	#message(event) {
		if (event.data?.type == Parallel.#RESPONSE) {
			const pending = this.#pending[event.data.id];
			delete this.#pending[event.data.id];

			if (!pending)
				return;

			if (event.data.error) {
				const error = new Error(event.data.result.message);
				error.name = event.data.result.name;
				error.stack = event.data.result.stack;
				pending.reject(error);
				return;
			}

			pending.resolve(event.data.result);
			return;
		}

		this.#handler?.(event);
	}

	/**
	 * @param {string} name
	 * @param {any[]} args
	 * @param {boolean} sync
	 * @returns {any | Promise<any>}
	 */
	#call(name, args, sync) {
		if (!args) args = [];

		const transfer = args.map(arg => this.#transferable(arg)).filter(Boolean);

		if (!sync) {
			const id = this.#next_id++;
			const promise = new Promise((resolve, reject) => {
				this.#pending[id] = { resolve, reject };
			});
			this.#worker.postMessage({ id, name, args, sync }, transfer);
			return promise;
		}

		if (typeof SharedArrayBuffer == 'undefined')
			throw new Error('SharedArrayBuffer is unavailable. Reload after the service worker is active, or serve WebRetro with COOP/COEP headers.');

		const sab = this.#buffers.length == 0
			? new Int32Array(new SharedArrayBuffer(Parallel.#BUFFER_SIZE))
			: this.#buffers.pop().fill(0);

		const message = { name, args: [sab, ...args], sync };
		this.#worker.postMessage(message, transfer);

		Atomics.wait(sab, 0, 0);

		const parse = () => {
			const result = parseMessage(sab);
			this.#buffers.push(sab);
			return result;
		};

		return parse();
	}
}
