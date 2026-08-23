#!/bin/env node

import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { createServer } from 'node:http';

const root = resolve(process.argv[2] ?? 'dist');
const port = Number(process.argv[3] ?? 8000);

const types = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.wasm': 'application/wasm',
};

const escapeHtml = (text) => text
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;');

const directoryListing = (file, pathname) => {
	const slash = pathname.endsWith('/') ? pathname : `${pathname}/`;
	const entries = readdirSync(file, { withFileTypes: true })
		.map(entry => ({
			name: entry.name,
			href: `${slash}${encodeURIComponent(entry.name)}${entry.isDirectory() ? '/' : ''}`,
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	return `<!doctype html>
<meta charset="utf-8">
<title>Index of ${escapeHtml(slash)}</title>
<h1>Index of ${escapeHtml(slash)}</h1>
<ul>
${entries.map(entry => `<li><a href="${entry.href}">${escapeHtml(entry.name)}</a></li>`).join('\n')}
</ul>
`;
};

const resolvePath = (url) => {
	const path = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
	const normalized = normalize(path).replace(/^(\.\.[/\\])+/, '');
	let file = resolve(join(root, normalized));

	if (!file.startsWith(root + sep) && file != root)
		return null;

	if (!existsSync(file))
		return null;

	if (statSync(file).isDirectory()) {
		const index = join(file, 'index.html');
		return existsSync(index) ? { file: index } : { listing: directoryListing(file, path) };
	}

	return existsSync(file) ? { file } : null;
};

createServer((request, response) => {
	const resolved = resolvePath(request.url);
	const file = resolved?.file ?? join(root, 'index.html');
	const type = types[extname(file)] ?? 'application/octet-stream';

	response.writeHead(200, {
		'Content-Type': resolved?.listing ? types['.html'] : type,
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Resource-Policy': 'cross-origin',
	});

	if (resolved?.listing)
		response.end(resolved.listing);
	else
		createReadStream(file).pipe(response);
}).listen(port, () => {
	console.log(`Serving ${root} on http://localhost:${port}/`);
});
