import { Game } from './game';

export class System {
	/** @type {string} */
	name;

	/** @type {string} */
	lib_name;

	/** @type {string} */
	core_name;

	/** @type {string} */
	core_version;

	/** @type {string[]} */
	extensions;

	/** @type {boolean} */
	needFullpath;

	/** @type {boolean} */
	blockExtract;

	/** @type {boolean} */
	contentRequired;

	/** @type {string[]} */
	builtinGames;

	/** @type {Game[]} */
	games;
}
