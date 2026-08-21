class NavigationEntry {
	id = 0;
	close = null;
}

export default class Navigation {
	static #entries = [];
	static #next = 1;
	static #started = false;
	static #closing = false;
	static #syncing = false;
	static #fallback = null;

	/** @param {() => boolean} fallback */
	static start(fallback = null) {
		this.#fallback = fallback;

		if (this.#started)
			return;

		this.#started = true;
		history.replaceState({ gamejin: true, root: true }, '');
		history.pushState({ gamejin: true, guard: true }, '');
		addEventListener('popstate', () => this.back());
		document.addEventListener('ionBackButton', (event) => {
			event.detail.register(100, () => this.back());
		});
	}

	/**
	 * @param {() => void | Promise<void>} close
	 * @returns {() => void}
	 */
	static push(close) {
		const entry = { id: this.#next++, close };
		this.#entries.push(entry);
		history.pushState({ gamejin: true, modal: entry.id }, '');

		return () => this.remove(entry);
	}

	/** @param {NavigationEntry} entry */
	static remove(entry) {
		const index = this.#entries.indexOf(entry);
		if (index == -1)
			return;

		this.#entries.splice(index, 1);

		if (!this.#closing && index == this.#entries.length) {
			this.#syncing = true;
			history.back();
		}
	}

	static async back() {
		if (this.#syncing) {
			this.#syncing = false;
			return;
		}

		const entry = this.#entries[this.#entries.length - 1];
		if (!entry) {
			this.#fallback?.();
			history.pushState({ gamejin: true }, '');
			return;
		}

		this.#closing = true;
		try {
			await entry.close();
		} finally {
			this.remove(entry);
			this.#closing = false;
		}
	}
}
