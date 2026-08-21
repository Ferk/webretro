import { Game } from '../entities/game';
import { System } from '../entities/system';
import Files from './files';

export default class Requests {
	static #manifest = null;

	/**
	 * @returns {Promise<{ [system: string]: string[] }>}
	 */
	static async #getManifest() {
		if (!this.#manifest)
			this.#manifest = await fetch('games.json', { cache: 'no-cache' }).then(res => res.ok ? res.json() : {}).catch(error => {
				console.error(error);
				return {};
			});

		return this.#manifest;
	}

	/**
	 * @param {System} system
	 * @param {{ [system: string]: string[] }} manifest
	 * @returns {Game[]}
	 */
	static #gamesFor(system, manifest) {
		const games = [
			...system.builtinGames.map(rom => new Game(system, rom, true, true)),
			...(manifest[system.name] ?? []).map(rom => new Game(system, rom, false)),
		];

		return games;
	}

	/**
	 * @returns {Promise<void>}
	 */
	static async refreshLibrary() {
		const library = await Files.Library.get();
		this.#manifest = null;
		const manifest = await this.#getManifest();

		for (const system of library)
			system.games = this.#gamesFor(system, manifest);

		await Files.Library.update(library);
	}

	/**
	 * @returns {Promise<System[]>}
	 */
	static async getSystems() {
		const systems = await Files.Library.get();
		const installed = await Files.Games.get();
		const manifest = await this.#getManifest();

		for (const system of systems) {
			const games = installed.filter(x => x.system == system.name);
			const available = this.#gamesFor(system, manifest);

			system.games = [
				...games,
				...available.filter(game => !games.find(installed => game.rom == installed.rom)),
			];

		}

		return systems;
	};

	/**
	 * @param {ReadableStream<Uint8Array>} stream
	 * @param {number} length
	 * @param {(progress: number) => void} progress
	 * @returns {Promise<Uint8Array>}
	 */
	static async readStream(stream, length, progress) {
		try {
			length = Number(length);
			const total = Number.isFinite(length) && length > 0 ? length : null;
			const chunks = [];
			let offset = 0;
			const reader = stream.getReader();

			await reader.read().then(function process({ done, value }) {
				if (done) return;

				chunks.push(value);
				offset += value.length;

				if (total)
					progress(Math.min(offset / total, 1));

				return reader.read().then(process);
			});

			const buffer = new Uint8Array(offset);
			let cursor = 0;
			for (const chunk of chunks) {
				buffer.set(chunk, cursor);
				cursor += chunk.length;
			}

			progress(1);
			return buffer;

		} catch (e) {
			console.error(e);
			return null;
		}
	}
}
