/// <reference lib="webworker" />

export default class Filesystem {
	/** @type {number} */
	static #next_id = 1;

	/**
	 * @param {string} path
	 * @returns {{ path: string, filename: string, directories: string[] }}
	 */
	static #parse(path) {
		path = `/${path}`.replace(/^\/+/, '/');

		const filename = path.substring(path.lastIndexOf('/') + 1);
		const directories = path.substring(1).indexOf('/') != -1
			? path.substring(1, path.lastIndexOf('/')).split('/')
			: [];

		return { path, directories, filename };
	}

	/**
	 * @param {string} path
	 * @returns {Promise<FileSystemDirectoryHandle>}
	 */
	static async #directory(path, create) {
		let directory = await navigator.storage.getDirectory();
		for (const component of Filesystem.#parse(path).directories)
			directory = await directory.getDirectoryHandle(component, { create });
		return directory;
	}

	/**
	 * @param {FileSystemDirectoryHandle} root
	 * @param {string} path
	 * @returns {Promise<string[]>}
	 */
	static async #list(root, path) {
		if (!root) root = await navigator.storage.getDirectory();
		if (!path) path = '';

		const files = []
		for await (const handle of root.values()) {
			if (handle.kind == 'file')
				files.push(`${path}/${handle.name}`);

			if (handle.kind == 'directory')
				files.push(...await Filesystem.#list(handle, `${path}/${handle.name}`));
		}
		return files;
	};

	/**
	 * @param {string} path
	 * @returns {Promise<{ name: string, directory: boolean }[]>}
	 */
	static async #entries(path) {
		const directory = await Filesystem.#directory(`${path.replace(/\/$/, '')}/.`, false);
		const entries = [];
		for await (const handle of directory.values())
			entries.push({ name: handle.name, directory: handle.kind == 'directory' });
		return entries;
	}

	/**
	 * @param {string} path
	 * @param {(file: FileSystemSyncAccessHandle) => number} action
	 * @returns {Promise<number>}
	 */
	static async #exec(path, create, action) {
		const file = Filesystem.#parse(path);
		// OPFS access handles lock files across tabs. Hold one only for the
		// operation, under a shared-origin Web Lock, including on failure.
		return navigator.locks.request(`gamejin:file:${file.path}`, async () => {
			const directory = await Filesystem.#directory(file.path, create);
			const handle = await directory.getFileHandle(file.filename, { create });
			const access = await handle.createSyncAccessHandle();
			try {
				return action(access);
			} finally {
				access.close();
			}
		});
	}

	/**
	 * @param {() => Promise<number>} action
	 * @returns {Promise<number>}
	 */
	static async #catch(action, err_val, log = true) {
		try {
			return await action();

		} catch (e) {
			if (log)
				console.error(e);
			return err_val;
		}
	}

	/**
	 * @returns {number | Promise<number>}
	 */
	id() {
		return Filesystem.#next_id++;
	}

	/**
	 * @returns {string[] | Promise<string[]>}
	 */
	list() {
		return Filesystem.#catch(() => {
			return Filesystem.#list();
		}, []);
	}

	/**
	 * @param {string} path
	 * @returns {{ name: string, directory: boolean }[] | Promise<{ name: string, directory: boolean }[]>}
	 */
	entries(path) {
		return Filesystem.#catch(() => Filesystem.#entries(path), null, false);
	}

	/**
	 * @param {string} path
	 * @returns {number | Promise<number>}
	 */
	size(path) {
		return Filesystem.#catch(() => {
			return Filesystem.#exec(path, false, (file) => file.getSize());
		}, -1, false);
	}

	/**
	 * @param {string} path
	 * @param {Uint8Array} buffer
	 * @param {number} offset
	 * @returns {number | Promise<number>}
	 */
	read(path, buffer, offset) {
		return Filesystem.#catch(() => {
			return Filesystem.#exec(path, false, (file) => file.read(buffer, { at: offset }));
		}, -1);
	}

	/**
	 * @param {string} path
	 * @returns {Uint8Array | Promise<Uint8Array>}
	 */
	async readFile(path) {
		const size = await this.size(path);
		if (size < 0)
			return null;

		const buffer = new Uint8Array(size);
		await this.read(path, buffer, 0);
		return buffer;
	}

	/**
	 * @param {string} path
	 * @param {Uint8Array} buffer
	 * @param {number} offset
	 * @returns {number | Promise<number>}
	 */
	write(path, buffer, offset) {
		return Filesystem.#catch(() => {
			return Filesystem.#exec(path, true, file => {
				const written = file.write(buffer, { at: offset });
				file.flush();
				return written;
			});
		}, -1);
	}

	/** Replace a complete file and report storage errors to the caller. */
	replace(path, buffer) {
		return Filesystem.#exec(path, true, file => {
			const written = file.write(buffer, { at: 0 });
			if (written != buffer.byteLength)
				throw new Error(`Incomplete write to ${path}: ${written} of ${buffer.byteLength} bytes.`);
			file.truncate(written);
			file.flush();
			return written;
		});
	}

	/**
	 * @param {string} path
	 * @param {number} size
	 * @returns {number | Promise<number>}
	 */
	truncate(path, size) {
		return Filesystem.#catch(() => {
			return Filesystem.#exec(path, false, file => {
				file.truncate(size);
				return 0;
			});
		}, -1);
	}

	/**
	 * @param {string} path
	 * @returns {number | Promise<number>}
	 */
	mkdir(path) {
		return Filesystem.#catch(async () => {
			await Filesystem.#directory(`${path}/.`, true);
			return 0;
		}, -1);
	}

	/**
	 * @param {string} path
	 * @returns {number | Promise<number>}
	 */
	rmdir(path) {
		return Filesystem.#catch(async () => {
			const directory = await Filesystem.#directory(path);
			await directory.removeEntry(Filesystem.#parse(path).filename);
			return 0;
		}, -1);
	}

	/**
	 * @param {string} path
	 * @returns {number | Promise<number>}
	 */
	remove(path) {
		return Filesystem.#catch(() => navigator.locks.request(`gamejin:file:${Filesystem.#parse(path).path}`, async () => {
			const handle = await Filesystem.#directory(path);
			await handle.removeEntry(Filesystem.#parse(path).filename);

			return 0;
		}), -1);
	}

	/**
	 * @param {string} old_path
	 * @param {string} new_path
	 * @returns {number | Promise<number>}
	 */
	rename(old_path, new_path) {
		return Filesystem.#catch(async () => {
			const data = await this.readFile(old_path);
			if (!data)
				return -1;

			const written = await this.write(new_path, data, 0);
			if (written == -1)
				return -1;

			await this.remove(old_path);
			return 0;
		}, -1);
	}

	/**
	 * @param {string} path
	 * @returns {void | Promise<void>}
	 */
	close(path) {
		return 0;
	}
}
