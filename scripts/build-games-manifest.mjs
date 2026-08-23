import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, sep } from 'node:path';

const [gamesDir, manifestPath] = process.argv.slice(2);

const cores = JSON.parse(await readFile('cores/cores.json', 'utf8'));
const extensions = new Set(Object.values(cores).flatMap(core => core.extensions ?? []));
const platforms = new Map();
const platformNames = new Set();

const normalize = (name) => name
	?.toLowerCase()
	.normalize('NFKD')
	.replace(/[^\p{Letter}\p{Number}]+/gu, '');

for (const core of Object.values(cores)) {
	for (const platform of core.platforms ?? core.systems ?? []) {
		const name = typeof platform == 'string' ? platform : platform.name;
		const aliases = typeof platform == 'string' ? [] : platform.aliases ?? [];

		platformNames.add(name);
		for (const alias of [name, ...aliases])
			platforms.set(normalize(alias), name);
	}

	for (const [name, aliases] of Object.entries(core.platformAliases ?? {})) {
		platformNames.add(name);
		for (const alias of [name, ...aliases])
			platforms.set(normalize(alias), name);
	}
}

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

const findNfo = (rom, files) => [
	`${gameBaseName(rom)}.nfo`,
	`${rom}.nfo`,
].find(name => files.has(name.toLowerCase()));

const directoryFiles = async (directory) => new Set((await readdir(directory, { withFileTypes: true }))
	.filter(file => file.isFile())
	.map(file => file.name.toLowerCase()));

const sourcePath = (path) => relative(gamesDir, path).split(sep).join('/');

const platformFromPath = (path) => {
	const parts = dirname(sourcePath(path)).split('/').filter(Boolean);

	for (let index = parts.length - 1; index >= 0; index--) {
		const platform = platforms.get(normalize(parts[index]));
		if (platform)
			return { platform, root: parts.slice(0, index + 1).join('/') };
	}

	return null;
};

const gameEntry = async (path) => {
	const directory = dirname(path);
	const rom = basename(path);
	const files = await directoryFiles(directory);
	const nfo = findNfo(rom, files);

	const size = (await stat(path)).size;
	const metadata = nfo ? await parseNfo(join(directory, nfo)) : {};
	const pathPlatform = platformFromPath(path);
	const platform = platforms.get(normalize(metadata.platform)) ?? pathPlatform?.platform;
	if (!platform)
		return null;

	const source = sourcePath(path);
	const root = pathPlatform?.root;
	const romPath = root && source.startsWith(`${root}/`)
		? source.slice(root.length + 1)
		: source;
	const entry = {};

	if (Object.keys(metadata).length)
		entry.metadata = metadata;
	if (size > 0)
		entry.size = size;
	if (source != `${platform}/${romPath}`)
		entry.source = source;

	return {
		platform,
		entry: Object.keys(entry).length ? { rom: romPath, ...entry } : romPath,
	};
};

const scan = async (directory) => {
	const games = [];

	for (const file of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, file.name);
		if (file.isDirectory())
			games.push(...await scan(path));
		else if (file.isFile() && isGame(file.name))
			games.push(path);
	}

	return games;
};

const manifest = {};

try {
	for (const platform of platformNames)
		manifest[platform] = [];

	for (const game of await Promise.all((await scan(gamesDir)).sort((left, right) => left.localeCompare(right)).map(gameEntry))) {
		if (game)
			manifest[game.platform].push(game.entry);
	}

	for (const platform of Object.keys(manifest))
		if (!manifest[platform].length)
			delete manifest[platform];
} catch (error) {
	if (error.code != 'ENOENT')
		throw error;
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`);
