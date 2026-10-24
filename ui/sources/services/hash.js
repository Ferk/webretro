const shifts = [
	7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
	5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
	4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
	6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const constants = Array.from({ length: 64 }, (_, index) =>
	Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0
);

const rotateLeft = (value, amount) => (value << amount) | (value >>> (32 - amount));

/**
 * @param {Uint8Array} data
 * @returns {string}
 */
export const md5 = (data) => {
	const length = data.length;
	const paddedLength = ((length + 9 + 63) >> 6) << 6;
	const padded = new Uint8Array(paddedLength);
	padded.set(data);
	padded[length] = 0x80;
	new DataView(padded.buffer).setUint32(paddedLength - 8, length * 8, true);

	let a0 = 0x67452301;
	let b0 = 0xefcdab89;
	let c0 = 0x98badcfe;
	let d0 = 0x10325476;

	for (let offset = 0; offset < padded.length; offset += 64) {
		const words = new Uint32Array(16);
		for (let index = 0; index < 16; index++)
			words[index] = new DataView(padded.buffer, offset + index * 4, 4).getUint32(0, true);

		let a = a0;
		let b = b0;
		let c = c0;
		let d = d0;

		for (let index = 0; index < 64; index++) {
			let functionValue;
			let wordIndex;

			if (index < 16) {
				functionValue = (b & c) | (~b & d);
				wordIndex = index;
			} else if (index < 32) {
				functionValue = (d & b) | (~d & c);
				wordIndex = (5 * index + 1) % 16;
			} else if (index < 48) {
				functionValue = b ^ c ^ d;
				wordIndex = (3 * index + 5) % 16;
			} else {
				functionValue = c ^ (b | ~d);
				wordIndex = (7 * index) % 16;
			}

			const sum = (a + functionValue + constants[index] + words[wordIndex]) >>> 0;
			const next = (b + rotateLeft(sum, shifts[index])) >>> 0;
			a = d;
			d = c;
			c = b;
			b = next;
		}

		a0 = (a0 + a) >>> 0;
		b0 = (b0 + b) >>> 0;
		c0 = (c0 + c) >>> 0;
		d0 = (d0 + d) >>> 0;
	}

	return [a0, b0, c0, d0].map(value =>
		Array.from(new Uint8Array(new Uint32Array([value]).buffer))
			.map(byte => byte.toString(16).padStart(2, '0'))
			.join('')
	).join('');
};

/**
 * @param {Uint8Array} data
 * @param {AbortSignal} signal
 * @returns {Promise<string|null>}
 */
export const md5Async = (data, signal = null) => {
	if (signal?.aborted)
		return Promise.resolve(null);

	return new Promise((resolve, reject) => {
		const worker = new Worker('hash-worker.js', { type: 'module', name: 'gamejin-md5' });
		let finished = false;
		const finish = (result, error = null) => {
			if (finished)
				return;

			finished = true;
			worker.terminate();
			signal?.removeEventListener('abort', abort);
			if (error)
				reject(error);
			else
				resolve(result);
		};
		const abort = () => finish(null);

		worker.onmessage = ({ data: result }) => {
			if (result.error)
				finish(null, new Error(result.error));
			else
				finish(result.md5sum);
		};
		worker.onerror = (event) => {
			finish(null, event.error ?? new Error(event.message));
		};
		signal?.addEventListener('abort', abort, { once: true });
		worker.postMessage({
			buffer: data.buffer,
			offset: data.byteOffset,
			length: data.byteLength,
		}, [data.buffer]);
	});
};
