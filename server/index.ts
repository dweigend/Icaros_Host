/**
 * Purpose: production entrypoint that combines SvelteKit HTTP handling with the
 * Icaros WebSocket runtime. It owns process startup only; protocol and station
 * behavior stay in reusable server libraries.
 */
import { existsSync, readFileSync } from 'node:fs';
import {
	createServer as createHttpServer,
	type Server as HttpServer,
	type RequestListener
} from 'node:http';
import {
	createServer as createHttpsServer,
	type Server as HttpsServer,
	type ServerOptions as HttpsServerOptions
} from 'node:https';

import { createIcarosWebSocketGateway } from '../src/lib/server/ws';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';
const PROTOCOL_HEADER = 'x-forwarded-proto';

type RuntimeServer = HttpServer | HttpsServer;

type RuntimeServerConfig = Readonly<{
	protocol: 'http' | 'https';
	server: RuntimeServer;
}>;

async function start(): Promise<void> {
	process.env.PROTOCOL_HEADER ??= PROTOCOL_HEADER;

	const { handler } = await import('../build/handler.js');
	const tlsOptions = loadTlsOptions();
	const protocol = tlsOptions === null ? 'http' : 'https';
	const { server } = createRuntimeServer(createProtocolAwareHandler(handler, protocol), tlsOptions);
	const gateway = createIcarosWebSocketGateway();

	gateway.attach(server);

	server.listen(port, host, () => {
		console.log(`Icaros Host listening on ${protocol}://${host}:${port}`);
	});

	const stop = (): void => {
		gateway.dispose();
		server.close();
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

await start();

function createProtocolAwareHandler(
	handler: RequestListener,
	protocol: RuntimeServerConfig['protocol']
): RequestListener {
	return (request, response) => {
		request.headers[PROTOCOL_HEADER] ??= protocol;
		handler(request, response);
	};
}

function createRuntimeServer(
	handler: RequestListener,
	tlsOptions: HttpsServerOptions | null
): RuntimeServerConfig {
	if (tlsOptions === null) {
		return {
			protocol: 'http',
			server: createHttpServer(handler)
		};
	}

	return {
		protocol: 'https',
		server: createHttpsServer(tlsOptions, handler)
	};
}

function loadTlsOptions(): HttpsServerOptions | null {
	const keyFile = process.env.ICAROS_TLS_KEY_FILE ?? DEFAULT_TLS_KEY_FILE;
	const certFile = process.env.ICAROS_TLS_CERT_FILE ?? DEFAULT_TLS_CERT_FILE;

	if (!existsSync(keyFile) || !existsSync(certFile)) {
		return null;
	}

	return {
		key: readFileSync(keyFile),
		cert: readFileSync(certFile)
	};
}
