import { Game } from '../entities/game';
import { System } from '../entities/system';
import Files from './files';

export default class Requests {
	static #manifest = null;

	static #cores = null;

	static #extensions = null;

	static #platforms = null;

	static #platformNames = null;

	static #decoder = document.createElement('textarea');

	static #mergeManifest(target, source) {
		for (const [platform, games] of Object.entries(source ?? {}))
			target[platform] = [...target[platform] ?? [], ...games];

		return target;
	}

	static #normalize(name) {
		return name
			?.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\p{Letter}\p{Number}]+/gu, '');
	}

	static async #getCores() {
		if (!this.#cores)
			this.#cores = await fetch('cores.json').then(res => res.json());

		return this.#cores;
	}

	static async #getPlatformData() {
		if (this.#platforms)
			return;

		const cores = await this.#getCores();
		this.#extensions = new Set(Object.values(cores).flatMap(core => core.extensions ?? []));
		this.#platforms = new Map();
		this.#platformNames = new Set();

		for (const core of Object.values(cores)) {
			for (const platform of core.platforms ?? core.systems ?? []) {
				const name = typeof platform == 'string' ? platform : platform.name;
				const aliases = typeof platform == 'string' ? [] : platform.aliases ?? [];

				this.#platformNames.add(name);
				for (const alias of [name, ...aliases])
					this.#platforms.set(this.#normalize(alias), name);
			}

			for (const [name, aliases] of Object.entries(core.platformAliases ?? {})) {
				this.#platformNames.add(name);
				for (const alias of [name, ...aliases])
					this.#platforms.set(this.#normalize(alias), name);
			}
		}
	}

	static #isGame(path) {
		const lower = path.toLowerCase();
		return [...this.#extensions].some(extension => lower.endsWith(extension.toLowerCase()));
	}

	static async supportsGame(path) {
		await this.#getPlatformData();
		return this.#isGame(path);
	}

	static #platformFromExtension(path) {
		const lower = path.toLowerCase();
		const matches = [];

		for (const games of Object.values(this.#cores)) {
			for (const system of games.platforms ?? games.systems ?? []) {
				const name = typeof system == 'string' ? system : system.name;
				if ((games.extensions ?? []).some(extension => lower.endsWith(extension.toLowerCase())))
					matches.push(name);
			}
		}

		return [...new Set(matches)].length == 1 ? matches[0] : null;
	}

	static #gameBaseName(name) {
		const lower = name.toLowerCase();
		const extension = [...this.#extensions]
			.sort((left, right) => right.length - left.length)
			.find(extension => lower.endsWith(extension.toLowerCase()));

		return extension ? name.slice(0, -extension.length) : name;
	}

	static #decodeHtml(text) {
		this.#decoder.innerHTML = text;
		return this.#decoder.value;
	}

	static #decodeXml(text) {
		return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_, entity) => {
			if (entity.startsWith('#x'))
				return String.fromCodePoint(parseInt(entity.slice(2), 16));
			if (entity.startsWith('#'))
				return String.fromCodePoint(parseInt(entity.slice(1), 10));
			return this.#decodeHtml(`&${entity};`);
		});
	}

	static #parseNfo(text) {
		const body = text.match(/<game\b[^>]*>([\s\S]*)<\/game>/i)?.[1] ?? text;
		const metadata = {};

		for (const match of body.matchAll(/<([a-zA-Z][\w:-]*)>\s*([\s\S]*?)\s*<\/\1>/g)) {
			const key = match[1].toLowerCase();
			const value = this.#decodeXml(match[2].replace(/<[^>]+>/g, '').trim());
			if (value)
				metadata[key] = value;
		}

		return metadata;
	}

	static #listingLinks(base, html, root = 'games/') {
		const document = new DOMParser().parseFromString(html, 'text/html');
		const baseUrl = new URL(base, window.location.href);
		const rootUrl = new URL(root, window.location.href);

		return [...document.querySelectorAll('a[href]')]
			.map(anchor => new URL(anchor.getAttribute('href'), baseUrl))
			.filter(url => url.pathname.startsWith(baseUrl.pathname))
			.filter(url => url.pathname != baseUrl.pathname)
			.map(url => ({
				url,
				path: decodeURIComponent(url.pathname.slice(rootUrl.pathname.length)),
				directory: url.pathname.endsWith('/'),
			}));
	}

	static async #readListing(path, root = 'games/') {
		const response = await fetch(path, { cache: 'no-cache' });
		if (!response.ok || !response.headers.get('Content-Type')?.includes('text/html'))
			return [];

		const html = await response.text();
		return this.#listingLinks(path, html, root);
	}

	static async #scanListings(path = 'games/', root = path) {
		const entries = await this.#readListing(path, root);
		const files = [];

		for (const entry of entries) {
			if (entry.directory)
				files.push(...await this.#scanListings(entry.url.href, root));
			else
				files.push(entry.path);
		}

		return files;
	}

	static async #fetchNfo(path, root = 'games/') {
		const directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
		const rom = path.slice(directory.length);
		const candidates = [
			`${directory}${this.#gameBaseName(rom)}.nfo`,
			`${directory}${rom}.nfo`,
		];

		for (const candidate of candidates) {
			const response = await fetch(new URL(candidate.split('/').map(encodeURIComponent).join('/'), root), { cache: 'no-cache' });
			if (response.ok && !response.headers.get('Content-Type')?.includes('text/html'))
				return this.#parseNfo(await response.text());
		}

		return {};
	}

	static #platformFromPath(path) {
		const parts = path.split('/').slice(0, -1);

		for (let index = parts.length - 1; index >= 0; index--) {
			const platform = this.#platforms.get(this.#normalize(parts[index]));
			if (platform)
				return { platform, root: parts.slice(0, index + 1).join('/') };
		}

		return null;
	}

	static async #listingEntry(path, root = 'games/') {
		const metadata = await this.#fetchNfo(path, root);
		const pathPlatform = this.#platformFromPath(path);
		const platform = this.#platforms.get(this.#normalize(metadata.platform)) ?? pathPlatform?.platform ?? this.#platformFromExtension(path);
		if (!platform)
			return null;

		const platformRoot = pathPlatform?.root;
		const rom = platformRoot && path.startsWith(`${platformRoot}/`) ? path.slice(platformRoot.length + 1) : path;
		const entry = {};

		if (Object.keys(metadata).length)
			entry.metadata = metadata;
		entry.source = new URL(path.split('/').map(encodeURIComponent).join('/'), root).href;

		return {
			platform,
			entry: Object.keys(entry).length ? { rom, ...entry } : rom,
		};
	}

	static async #getListingManifest(root = 'games/') {
		await this.#getPlatformData();

		const manifest = {};
		for (const platform of this.#platformNames)
			manifest[platform] = [];

		const games = (await this.#scanListings(root, root))
			.filter(path => this.#isGame(path))
			.sort((left, right) => left.localeCompare(right));

		for (const game of await Promise.all(games.map(path => this.#listingEntry(path, root)))) {
			if (game)
				manifest[game.platform].push(game.entry);
		}

		for (const platform of Object.keys(manifest))
			if (!manifest[platform].length)
				delete manifest[platform];

		return manifest;
	}

	static #sourcePath(base, platform, rom, source) {
		const path = source ?? `${platform}/${rom}`;
		return /^https?:\/\//i.test(path) ? path : new URL(path.split('/').map(encodeURIComponent).join('/'), base).href;
	}

	static #resolveManifest(base, manifest) {
		const resolved = {};

		for (const [platform, games] of Object.entries(manifest ?? {})) {
			resolved[platform] = games.map(game => {
				if (typeof game == 'string')
					return { rom: game, source: this.#sourcePath(base, platform, game) };

				return {
					...game,
					source: this.#sourcePath(base, platform, game.rom, game.source),
				};
			});
		}

		return resolved;
	}

	static async #getUrlManifest(source) {
		const url = new URL(source);
		const response = await fetch(url, { cache: 'no-cache' });
		if (!response.ok)
			throw new Error(`Source failed: ${response.status} ${response.statusText}`);

		const type = response.headers.get('Content-Type') ?? '';
		if (type.includes('application/json') || url.pathname.endsWith('.json'))
			return this.#resolveManifest(url.href.slice(0, url.href.lastIndexOf('/') + 1), await response.json());

		if (type.includes('text/html') || url.pathname.endsWith('/'))
			return await this.#getListingManifest(url.href.endsWith('/') ? url.href : `${url.href}/`);

		await this.#getPlatformData();
		const path = decodeURIComponent(url.pathname.split('/').pop());
		if (!this.#isGame(path))
			return {};

		const game = await this.#listingEntry(path, url.href.slice(0, url.href.lastIndexOf('/') + 1));
		return game ? { [game.platform]: [game.entry] } : {};
	}

	static async sourceType(source) {
		const url = new URL(source);
		const response = await fetch(url, { cache: 'no-cache' });
		if (!response.ok)
			throw new Error(`Source failed: ${response.status} ${response.statusText}`);

		const type = response.headers.get('Content-Type') ?? '';
		const collection = type.includes('application/json') || type.includes('text/html') || url.pathname.endsWith('.json') || url.pathname.endsWith('/');
		return {
			collection,
			response,
		};
	}

	static async #getSourcesManifest() {
		const manifest = {};

		for (const source of await Files.Sources.get()) {
			try {
				this.#mergeManifest(manifest, await this.#getUrlManifest(source.url));
			} catch (error) {
				console.error(error);
			}
		}

		return manifest;
	}

	/**
	 * @returns {Promise<{ [system: string]: (string|{ rom: string, source?: string, metadata?: { [key: string]: string }, size?: number })[] }>}
	 */
	static async #getManifest() {
		if (!this.#manifest) {
			const bundled = await fetch('games.json', { cache: 'no-cache' }).then(res => res.ok ? res.json() : this.#getListingManifest()).catch(error => {
				console.error(error);
				return this.#getListingManifest();
			});
			this.#manifest = this.#mergeManifest(bundled, await this.#getSourcesManifest());
		}

		return this.#manifest;
	}

	/**
	 * @param {string} url
	 * @returns {Promise<{ [system: string]: (string|{ rom: string, source?: string, metadata?: { [key: string]: string }, size?: number })[] }>}
	 */
	static async scanSource(url) {
		return await this.#getUrlManifest(url);
	}

	static async countSource(url) {
		const manifest = await this.scanSource(url);
		return Object.values(manifest).reduce((total, games) => total + games.length, 0);
	}

	/**
	 * @param {System} system
	 * @param {{ [system: string]: (string|{ rom: string, source?: string, metadata?: { [key: string]: string }, size?: number })[] }} manifest
	 * @returns {Game[]}
	 */
	static #gamesFor(system, manifest) {
		const entry = (item) => typeof item == 'string'
			? new Game(system, item, false)
			: new Game(system, item.rom, false, false, item.metadata, item.size, item.source);

		const games = [
			...system.builtinGames.map(rom => new Game(system, rom, true, true)),
			...(manifest[system.name] ?? []).map(entry),
		];

		return games;
	}

	/**
	 * @param {Game} game
	 * @param {Game} source
	 * @returns {Game}
	 */
	static #withMetadata(game, source) {
		if (!source)
			return game;

		game.metadata = source.metadata;
		game.title = source.title;
		game.size = source.size;
		game.source = source.source;
		return game;
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
				...games.map(game => this.#withMetadata(game, available.find(item => item.rom == game.rom))),
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
