export class InputButton {
	/** @type {number} */
	id = 0;

	/** @type {DOMRect} */
	rect = null;

	/**
	 * @param {HTMLButtonElement} button
	 */
	constructor(button) {
		this.id = Number(button.dataset.id);
		this.rect = button.getBoundingClientRect();
	}
}

export class InputTouch {
	/** @type {string} */
	type = null;

	/** @type {number} */
	id = 0;

	/** @type {number} */
	x = 0;

	/** @type {number} */
	y = 0;

	/**
	 * @param {string} type
	 * @param {Touch} event
	 */
	constructor(type, event) {
		this.type = type;
		this.id = event.identifier ?? 0;
		this.x = event.clientX;
		this.y = event.clientY;
	}
}

export class InputMessage {
	/** @type {number} */
	device = 0;

	/** @type {number} */
	id = 0;

	/** @type {number} */
	value = 0;

	/**
	 * @returns {number}
	 */
	static #size() { return 16; };

	/**
	 * @param {WebAssembly.Instance} instance
	 * @param {InputMessage[]} messages
	 * @returns {number}
	 */
	static serialize(instance, messages) {
		if (!messages.length)
			return 0;

		const ptr = instance.exports.calloc(messages.length, this.#size());
		const view = new DataView(instance.exports.memory.buffer, ptr);

		let offset = 0;
		for (const message of messages) {
			view.setUint32(offset + 0, message.device, true);
			view.setUint32(offset + 4, message.id,     true);
			view.setInt16 (offset + 8, message.value,  true);
			view.setUint16(offset + 10, message.modifiers ?? 0, true);
			view.setUint32(offset + 12, message.character ?? 0, true);

			offset += this.#size();
		}

		return ptr;
	}

	/**
	 * @param {WebAssembly.Instance} instance
	 * @param {number} ptr
	 * @returns {void}
	 */
	static free(instance, ptr) {
		if (!ptr)
			return;

		instance.exports.free(ptr);
	}
}
