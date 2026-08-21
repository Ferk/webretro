import { Save } from '../entities/save';
import { CheatList } from '../entities/cheat';
import { System } from '../entities/system';
import { Game } from '../entities/game';
import { Settings } from '../entities/settings';
import Path from './path';
import Parallel from './parallel';
import Filesystem from './filesystem';
import WASI from './wasi';

export default class Files {
	/** @type {Object} */
	static #cores = null;

	/** @type {Object} */
	static #coreInfo = {};

	/** @type {TextEncoder} */
	static #encoder = new TextEncoder();

	/** @type {TextDecoder} */
	static #decoder = new TextDecoder();

	/** @type {Parallel<Filesystem>} */
	static #parallel = null

	/** @type {Filesystem} */
	static #filesystem = null

	/**
	 * @param {WebAssembly.Instance} instance
	 * @param {number} ptr
	 * @returns {string}
	 */
	static #readString(instance, ptr) {
		if (!ptr)
			return null;

		let view = new Uint8Array(instance.exports.memory.buffer, ptr);
		let length = 0; for (; view[length] != 0; length++);
		view = new Uint8Array(instance.exports.memory.buffer, ptr, length);

		return Files.#decoder.decode(new Uint8Array(view));
	}

	/**
	 * @param {string} core
	 * @returns {Promise<Object>}
	 */
	static async #probeCore(core) {
		if (Files.#coreInfo[core])
			return Files.#coreInfo[core];

		const memory = new WebAssembly.Memory({
			initial: (200 * 1024 * 1024) / 65536,
			maximum: (600 * 1024 * 1024) / 65536,
			shared: true,
		});
		const filesystem = {
			id: () => 0,
			size: () => -1,
			read: () => -1,
			write: () => -1,
			mkdir: () => -1,
			rmdir: () => -1,
			remove: () => -1,
		};
		const wasi = new WASI(memory, filesystem);

		const source = await WebAssembly.instantiateStreaming(fetch(`modules/${core}.wasm`), {
			env: {
				memory,
				web_video: () => {},
				web_audio: () => {},
				web_variables: () => {},
				saveSetjmp: () => 0,
				testSetjmp: () => 0,
				getTempRet0: () => 0,
			},
			wasi_snapshot_preview1: wasi.environment,
			wasi: { 'thread-spawn': () => -1 },
		});

		const ptr = source.instance.exports.JunieProbeCore();
		const view = new DataView(source.instance.exports.memory.buffer, ptr);
		const extensions = Files.#readString(source.instance, view.getUint32(8, true));

		Files.#coreInfo[core] = {
			name: Files.#readString(source.instance, view.getUint32(0, true)),
			version: Files.#readString(source.instance, view.getUint32(4, true)),
			extensions: extensions ? extensions.split('|').filter(Boolean) : [],
			needFullpath: !!view.getUint8(12),
			blockExtract: !!view.getUint8(13),
			contentRequired: !view.getUint8(14),
		};

		return Files.#coreInfo[core];
	}

	static async #fs() {
		if (!this.#filesystem) {
			this.#parallel = new Parallel(Filesystem, false);
			this.#filesystem = await this.#parallel.create('filesystem');
		}
		return this.#filesystem;
	}

	/**
	 * @returns {Promise<MessagePort>}
	 */
	static async clone() {
		return this.#parallel.open();
	}

	/**
	 * @returns {Promise<string[]>}
	 */
	static async list() {
		const fs = await this.#fs();
		return await fs.list();
	}

	/**
	 * @param {string} path
	 * @returns {Promise<Uint8Array>}
	 */
	static async read(path) {
		const fs = await this.#fs();

		const size = await fs.size(path);
		if (size < 0)
			return null;

		if (typeof SharedArrayBuffer == 'undefined')
			return await fs.readFile(path);

		const buffer = new Uint8Array(new SharedArrayBuffer(size));
		await fs.read(path, buffer, 0);

		return buffer.slice();
	}

	/**
	 * @template T
	 * @param {string} path
	 * @returns {Promise<T>}
	 */
	static async read_json(path) {
		const file = await Files.read(path);
		if (!file) return null;

		try {
			return JSON.parse(this.#decoder.decode(file));
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	/**
	 * @param {string} path
	 * @param {Uint8Array} data
	 * @returns {Promise<void>}
	 */
	static async write(path, data) {
		const fs = await this.#fs();

		if (await fs.size(path) >= 0)
			await fs.remove(path);
		await fs.write(path, data, 0);
	}

	/**
	 * @template T
	 * @param {string} path
	 * @param {T} data
	 * @returns {Promise<void>}
	 */
	static async write_json(path, data) {
		const encoded = this.#encoder.encode(JSON.stringify(data));
		await Files.write(path, encoded);
	}

	/**
	 * @param {string} path
	 * @returns {Promise<void>}
	 */
	static async remove(path) {
		const fs = await this.#fs();

		await fs.remove(path);
	}

	static Library = class {
		/**
		 * @param {boolean} force
		 * @returns {Promise<System[]>}
		 */
		static async get() {
			if (!Files.#cores)
				Files.#cores = await fetch('cores.json').then(res => res.json());
			const stored = await Files.read_json(Path.library()) ?? [];

			const systems = [];
			for (const core of Object.keys(Files.#cores)) {
				const metadata = Files.#cores[core];
				const discovered = await Files.#probeCore(core);

				for (const system of Files.#cores[core].systems) {
					const games = stored.find(x => x.name == system)?.games ?? [];
					const contentRequired = metadata.contentRequired ?? discovered.contentRequired;
					const builtinGames = metadata.builtinGames ?? (!contentRequired ? [system] : []);

					systems.push({
						name: system,
						lib_name: core,
						core_name: metadata.name ?? discovered.name,
						core_version: metadata.version ?? discovered.version,
						extensions: metadata.extensions ?? discovered.extensions,
						needFullpath: metadata.needFullpath ?? discovered.needFullpath,
						blockExtract: metadata.blockExtract ?? discovered.blockExtract,
						contentRequired,
						builtinGames,
						games: games.map(game => new Game(system, game.rom, false)),
					});
				}
			}

			return systems;
		};

		/**
		 * @param {System[]} systems
		 * @returns {Promise<void>}
		 */
		static async update(systems) {
			await Files.write_json(Path.library(), systems);
		}
	}

	static Settings = class {
		/**
		 * @returns {Promise<Settings>}
		 */
		static async get() {
			return new Settings(await Files.read_json(Path.settings()));
		};

		/**
		 * @param {Settings} settings
		 * @returns {Promise<void>}
		 */
		static async update(settings) {
			await Files.write_json(Path.settings(), settings);
		}
	}

	static Saves = class {
		/**
		 * @returns {Promise<Save[]>}
		 */
		static async get() {
			const paths = (await Files.list()).filter(path => path.split('/').length == 4);

			return paths.map(path => new Save(path)).reduce((saves, save) => {
				const found = saves.find(x => x.system == save.system && x.game == save.game);
				found ? found.paths.push(save.paths[0]) : saves.push(save);

				return saves;
			}, []);
		};

		/**
		 * @param {Save} save
		 * @param {System} system
		 * @param {Game} game
		 * @returns {Promise<void>}
		 */
		static async fix(save, system, game) {
			for (const path of save.paths) {
				const new_path = path.replace(save.system, system.name).replaceAll(save.game, game.name);

				const data = await Files.read(path);
				await Files.remove(path);
				await Files.write(new_path, data);
			}
		}

		/**
		 * @param {Save} save
		 * @returns {Promise<void>}
		 */
		static async remove(save) {
			for (let path of save.paths)
				await Files.remove(path);
		}
	}

	static Cheats = class {
		/**
		 * @returns {Promise<CheatList[]>}
		 */
		static async get() {
			const paths = (await Files.list()).filter(path => path.endsWith('.cht'));

			const files = [];
			for (const path of paths) {
				const cheats = await Files.read_json(path)
				files.push(CheatList.fromFile(path, cheats));
			}

			return files;
		};

		/**
		 * @param {CheatList} cheatlist
		 * @returns {Promise<void>}
		 */
		static async update(cheatlist) {
			await Files.write_json(Path.cheat(cheatlist.system, cheatlist.game), cheatlist.cheats);
		}

		/**
		 * @param {CheatList} cheatlist
		 * @returns {Promise<void>}
		 */
		static async remove(cheatlist) {
			await Files.remove(Path.cheat(cheatlist.system, cheatlist.game));
		}
	}

	static Games = class {
		/**
		 * @returns {Promise<Game[]>}
		 */
		static async get() {
			const systems = await Files.Library.get();
			const paths = (await Files.list()).filter(path => path.split('/').length == 3);

			const files = [];

			for (const path of paths) {
				const [system_name, rom_name] = Path.parse(path);

				const system = systems.find(x => x.name == system_name);
				if (system)
					files.push(new Game(system, rom_name, true));
			}

			return files;
		};

		/**
		 * @param {string} system
		 * @param {string} rom
		 * @param {Uint8Array} data
		 * @param {Promise<void>}
		 */
		static async add(system, rom, data) {
			await Files.write(Path.game(system, rom), data);
		}

		/**
		 * @param {string} system
		 * @param {string} rom
		 * @returns {Promise<void>}
		 */
		static async remove(system, rom) {
			await Files.remove(Path.game(system, rom));
		}
	}
}
