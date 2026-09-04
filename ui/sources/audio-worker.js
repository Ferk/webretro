class AudioProcessor extends AudioWorkletProcessor {
	/** @type {Int16Array[]} */
	#buffers = []

	/** @type {Int16Array} */
	#buffer = null;

	/** @type {number} */
	#index = 0;

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

		left.fill(0);
		right.fill(0);
		for (let sample = 0; sample < 128; sample++) {
			if (!this.#buffer || this.#index >= this.#buffer.length) {
				this.#buffer = this.#buffers.shift();
				this.#index = 0;
				if (!this.#buffer)
					break;
			}

			left[sample]  = this.#buffer[this.#index + 0] / 32768;
			right[sample] = this.#buffer[this.#index + Math.min(1, this.#channels - 1)] / 32768;
			this.#index += this.#channels;
			this.#queued--;
		}

		return true;
	}
}

registerProcessor('audio-processor', AudioProcessor);
