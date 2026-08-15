import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [gamesDir, manifestPath] = process.argv.slice(2);

const extensions = new Set([
	'.gb', '.gbc', '.gba', '.nds', '.nes', '.fds',
	'.sfc', '.smc', '.fig', '.swc',
	'.sms', '.gg', '.sg', '.md', '.gen', '.smd',
	'.bin', '.cue', '.iso', '.chd', '.pbp',
	'.n64', '.z64', '.v64',
	'.p8', '.p8.png', '.tic',
]);

const isGame = (name) => {
	const lower = name.toLowerCase();
	return [...extensions].some(extension => lower.endsWith(extension));
};

const manifest = {};

try {
	for (const system of await readdir(gamesDir, { withFileTypes: true })) {
		if (!system.isDirectory())
			continue;

		const files = await readdir(join(gamesDir, system.name), { withFileTypes: true });
		manifest[system.name] = files
			.filter(file => file.isFile() && isGame(file.name))
			.map(file => file.name)
			.sort((left, right) => left.localeCompare(right));
	}
} catch (error) {
	if (error.code != 'ENOENT')
		throw error;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
