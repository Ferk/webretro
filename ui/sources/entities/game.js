import { System } from './system';
import Path from '../services/path';

export class Game {
	/** @type {String} */
	system;

	/** @type {String} */
	rom;

	/** @type {String} */
	name;

	/** @type {String} */
	title;

	/** @type {{ [key: string]: string }} */
	metadata;

	/** @type {number} */
	size;

	/** @type {Boolean} */
	installed;

	/** @type {Boolean} */
	builtin;

	/**
	 * @param {System|string} system
	 * @param {string} rom
	 * @param {boolean} installed
	 * @param {boolean} builtin
	 * @param {{ [key: string]: string }} metadata
	 * @param {number} size
	 */
	constructor(system, rom, installed, builtin = false, metadata = {}, size = null) {
		this.system = typeof system == 'string' ? system : system.name;
		this.rom = rom;
		this.installed = installed;
		this.builtin = builtin;
		this.name = Path.name(rom);
		this.metadata = metadata ?? {};
		this.title = this.metadata.title || this.name;
		this.size = size;
	}
}
