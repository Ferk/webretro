import { readFile, readdir, writeFile } from 'node:fs/promises';
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

const decodeEntity = (entity) => ({
	amp: '&',
	apos: "'",
	gt: '>',
	lt: '<',
	quot: '"',
}[entity] ?? entity);

const decodeXml = (text) => text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (_, entity) => {
	if (entity.startsWith('#x'))
		return String.fromCodePoint(parseInt(entity.slice(2), 16));
	if (entity.startsWith('#'))
		return String.fromCodePoint(parseInt(entity.slice(1), 10));
	return decodeEntity(entity.toLowerCase());
});

const parseNfo = async (path) => {
	const text = await readFile(path, 'utf8');
	const body = text.match(/<game\b[^>]*>([\s\S]*)<\/game>/i)?.[1] ?? text;
	const metadata = {};

	for (const match of body.matchAll(/<([a-zA-Z][\w:-]*)>\s*([\s\S]*?)\s*<\/\1>/g)) {
		const key = match[1].toLowerCase();
		const value = decodeXml(match[2].replace(/<[^>]+>/g, '').trim());
		if (value)
			metadata[key] = value;
	}

	return metadata;
};

const gameBaseName = (name) => {
	const lower = name.toLowerCase();
	const extension = [...extensions]
		.sort((left, right) => right.length - left.length)
		.find(extension => lower.endsWith(extension));

	return extension ? name.slice(0, -extension.length) : name;
};

const gameEntry = async (directory, rom, files) => {
	const names = [
		`${gameBaseName(rom)}.nfo`,
		`${rom}.nfo`,
	];
	const nfo = names.find(name => files.has(name.toLowerCase()));

	if (!nfo)
		return rom;

	const metadata = await parseNfo(join(directory, nfo));
	return Object.keys(metadata).length ? { rom, metadata } : rom;
};

const manifest = {};

try {
	for (const system of await readdir(gamesDir, { withFileTypes: true })) {
		if (!system.isDirectory())
			continue;

		const directory = join(gamesDir, system.name);
		const files = await readdir(directory, { withFileTypes: true });
		const fileNames = new Set(files.filter(file => file.isFile()).map(file => file.name.toLowerCase()));
		manifest[system.name] = await Promise.all(files
			.filter(file => file.isFile() && isGame(file.name))
			.map(file => file.name)
			.sort((left, right) => left.localeCompare(right))
			.map(rom => gameEntry(directory, rom, fileNames)));
	}
} catch (error) {
	if (error.code != 'ENOENT')
		throw error;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
