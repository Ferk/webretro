#!/bin/env node

import { createReadStream, existsSync, statSync } from 'node:fs';
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

const resolvePath = (url) => {
	const path = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
	const normalized = normalize(path).replace(/^(\.\.[/\\])+/, '');
	let file = resolve(join(root, normalized));

	if (!file.startsWith(root + sep) && file != root)
		return null;

	if (!existsSync(file))
		return null;

	if (statSync(file).isDirectory())
		file = join(file, 'index.html');

	return existsSync(file) ? file : null;
};

createServer((request, response) => {
	const file = resolvePath(request.url) ?? join(root, 'index.html');
	const type = types[extname(file)] ?? 'application/octet-stream';

	response.writeHead(200, {
		'Content-Type': type,
		'Cross-Origin-Opener-Policy': 'same-origin',
		'Cross-Origin-Embedder-Policy': 'require-corp',
		'Cross-Origin-Resource-Policy': 'cross-origin',
	});

	createReadStream(file).pipe(response);
}).listen(port, () => {
	console.log(`Serving ${root} on http://localhost:${port}/`);
});
