export default class Path {
	/**
	 * @returns {string}
	 */
	static library() {
		return '/library.json';
	}

	/**
	 * @returns {string}
	 */
	static settings() {
		return '/settings.json';
	}

	/**
	 * @returns {string}
	 */
	static sources() {
		return '/sources.json';
	}

	/**
	 * @param {string} system
	 * @param {string} game
	 * @returns {string}
	 */
	static game(system, game) {
		return `/.gamejin/games/${system}/${game}`;
	}

	/**
	 * @param {string} system
	 * @param {string} game
	 * @returns {string}
	 */
	static cheat(system, game) {
		return `/.gamejin/cheats/${system}/${game}/${game}.cht`;
	}

	/**
	 * @param {string} system
	 * @param {string} game
	 * @param {string} file
	 * @returns {string}
	 */
	static save(system, game, file) {
		return `/.gamejin/saves/${system}/${game}/${file}`;
	}

	/**
	 * @param {string} path
	 * @returns {[system: string, game: string]}
	 */
	static parseGame(path) {
		const matches = path.match(/^\/\.gamejin\/games\/([^/]+)\/(.+)$/);
		return [matches?.[1], matches?.[2]];
	}

	/**
	 * @param {string} path
	 * @returns {[system: string, game: string]}
	 */
	static parseSave(path) {
		const matches = path.match(/^\/\.gamejin\/saves\/([^/]+)\/([^/]+)\/.+$/);
		return [matches?.[1], matches?.[2]];
	}

	/**
	 * @param {string} path
	 * @returns {[system: string, game: string]}
	 */
	static parse(path) {
		const save = Path.parseSave(path);
		if (save[0])
			return save;

		const cheat = path.match(/^\/\.gamejin\/cheats\/([^/]+)\/([^/]+)\/.+$/);
		if (cheat)
			return [cheat[1], cheat[2]];

		return [null, null];
	}

	/**
	 * @param {string} name
	 * @returns {string}
	 */
	static name(name) {
		return name.substring(0, name.lastIndexOf('.')) || name;
	}

	/**
	 * @param {string} name
	 * @returns {string}
	 */
	static clean(name) {
		return name.replaceAll(/ \(.*\)/g, '');
	}
}
