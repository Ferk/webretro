class AudioProcessor extends AudioWorkletProcessor {
	/** @type {Int16Array[]} */
	#buffers = []

	/** @type {number} */
	#channels = 0;

	/** @type {number} */
	#queued = 0;

	constructor(options) {
		super();

		this.#channels = options.outputChannelCount[0];
		this.port.onmessage = message => {
			this.#buffers.push(message.data);
			this.#queued += message.data.length / this.#channels;

			const limit = Math.round(sampleRate * 0.5);
			while (this.#queued > limit && this.#buffers.length > 1) {
				const buffer = this.#buffers.shift();
				this.#queued -= buffer.length / this.#channels;
			}
		}
	}

	process(inputs, outputs, parameters) {
		const left  = outputs[0][0];
		const right = outputs[0][1];

		let index = 0;
		let buffer = null;
		for (let sample = 0; sample < 128; sample++) {
			if (!buffer || index >= buffer.length) {
				index = 0;
				buffer = this.#buffers.shift();
				if (!buffer)
					break;
				this.#queued -= buffer.length / this.#channels;
			}

			left[sample]  = buffer[index + 0] / 32768;
			right[sample] = buffer[index + Math.min(1, this.#channels - 1)] / 32768;
			index += this.#channels;
		}

		if (buffer && buffer.length > index) {
			const remaining = buffer.slice(index);
			this.#queued += remaining.length / this.#channels;
			this.#buffers.unshift(remaining);
		}

		return true;
	}
}

registerProcessor('audio-processor', AudioProcessor);
