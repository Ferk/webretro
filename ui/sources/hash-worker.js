import { md5 } from './services/hash';

self.onmessage = ({ data }) => {
	try {
		const bytes = new Uint8Array(data.buffer, data.offset, data.length);
		self.postMessage({ md5sum: md5(bytes) });
	} catch (error) {
		self.postMessage({ error: error.message ?? String(error) });
	}
};
