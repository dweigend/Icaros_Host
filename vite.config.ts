import { existsSync, readFileSync } from 'node:fs';
import type { ServerOptions as HttpsServerOptions } from 'node:https';

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const DEFAULT_DEV_HOST = '0.0.0.0';
const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';

const devHttps = resolveDevHttps();

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: process.env.ICAROS_DEV_HOST ?? DEFAULT_DEV_HOST,
		...(devHttps === undefined ? {} : { https: devHttps })
	}
});

function resolveDevHttps(): HttpsServerOptions | undefined {
	const keyFile = process.env.ICAROS_TLS_KEY_FILE ?? DEFAULT_TLS_KEY_FILE;
	const certFile = process.env.ICAROS_TLS_CERT_FILE ?? DEFAULT_TLS_CERT_FILE;

	if (!existsSync(keyFile) || !existsSync(certFile)) {
		return undefined;
	}

	return {
		key: readFileSync(keyFile),
		cert: readFileSync(certFile)
	};
}
