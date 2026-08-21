import { System } from './system';
import Path from '../services/path';

export class Game {
	/** @type {String} */
	system;

	/** @type {String} */
	rom;

	/** @type {String} */
	name;

	/** @type {Boolean} */
	installed;

	/** @type {Boolean} */
	builtin;

	/**
	 * @param {System|string} system
	 * @param {string} rom
	 * @param {boolean} installed
	 * @param {boolean} builtin
	 */
	constructor(system, rom, installed, builtin = false) {
		this.system = typeof system == 'string' ? system : system.name;
		this.rom = rom;
		this.installed = installed;
		this.builtin = builtin;
		this.name = Path.name(rom);
	}
}
