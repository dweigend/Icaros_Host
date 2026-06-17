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
	type ServerOptions as HttpsServerOptions
} from 'node:https';

import { DEFAULT_HTTPS_DEVICE_WS_PORT } from '../src/lib/server/device/pairing';
import { resolveServerOpenUrls } from '../src/lib/server/network';
import { createIcarosWebSocketGateway } from '../src/lib/server/ws';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';
const PROTOCOL_HEADER = 'x-forwarded-proto';

async function start(): Promise<void> {
	process.env.PROTOCOL_HEADER ??= PROTOCOL_HEADER;

	const { handler } = await import('../build/handler.js');
	const tlsOptions = loadTlsOptions();
	const protocol = 'https';
	const server = createHttpsServer(tlsOptions, createProtocolAwareHandler(handler));
	const gateway = createIcarosWebSocketGateway();
	const plainDeviceWsPort = resolvePlainDeviceWsPort();

	gateway.attach(server);
	const plainDeviceServer = plainDeviceWsPort === null ? null : createPlainDeviceServer(gateway);

	server.listen(port, host, () => {
		console.log(`Icaros Host listening on ${protocol}://${host}:${port}`);

		for (const openUrl of resolveServerOpenUrls(protocol, host, port)) {
			console.log(`${openUrl.label}: ${openUrl.url}`);
		}
	});

	if (plainDeviceServer !== null && plainDeviceWsPort !== null) {
		plainDeviceServer.listen(plainDeviceWsPort, host, () => {
			console.log(`M5 plain device WebSocket listening on ws://${host}:${plainDeviceWsPort}`);
		});
	}

	await waitForShutdown({ gateway, server, plainDeviceServer });
}

function createPlainDeviceServer(
	gateway: ReturnType<typeof createIcarosWebSocketGateway>
): HttpServer {
	const server = createHttpServer((_request, response) => {
		response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end('M5 device WebSocket endpoint only.\n');
	});
	gateway.attachDeviceServer(server);
	return server;
}

await start();

function createProtocolAwareHandler(handler: RequestListener): RequestListener {
	return (request, response) => {
		request.headers[PROTOCOL_HEADER] ??= 'https';
		handler(request, response);
	};
}

function loadTlsOptions(): HttpsServerOptions {
	const keyFile = process.env.ICAROS_TLS_KEY_FILE ?? DEFAULT_TLS_KEY_FILE;
	const certFile = process.env.ICAROS_TLS_CERT_FILE ?? DEFAULT_TLS_CERT_FILE;

	if (!existsSync(keyFile) || !existsSync(certFile)) {
		throw new Error(
			`Host requires HTTPS. Missing TLS files: key=${keyFile}, cert=${certFile}. Run the HTTPS setup before starting Icaros Host.`
		);
	}

	return {
		key: readFileSync(keyFile),
		cert: readFileSync(certFile)
	};
}

function resolvePlainDeviceWsPort(): number | null {
	const explicitOrigin = process.env.ICAROS_DEVICE_WS_ORIGIN?.trim();
	if (explicitOrigin !== undefined && explicitOrigin !== '') {
		return null;
	}

	const configuredPort = process.env.ICAROS_DEVICE_WS_PORT?.trim();
	if (configuredPort === 'none') {
		return null;
	}

	const devicePort = readPort(
		configuredPort ?? DEFAULT_HTTPS_DEVICE_WS_PORT,
		'ICAROS_DEVICE_WS_PORT'
	);

	if (devicePort === port) {
		throw new Error(
			'ICAROS_DEVICE_WS_PORT must differ from PORT, or use ICAROS_DEVICE_WS_PORT=none.'
		);
	}

	return devicePort;
}

function waitForShutdown({
	gateway,
	server,
	plainDeviceServer
}: Readonly<{
	gateway: ReturnType<typeof createIcarosWebSocketGateway>;
	server: ReturnType<typeof createHttpsServer>;
	plainDeviceServer: HttpServer | null;
}>): Promise<void> {
	return new Promise((resolve) => {
		const stop = (): void => {
			gateway.dispose();
			server.close();
			plainDeviceServer?.close();
			resolve();
		};

		process.once('SIGINT', stop);
		process.once('SIGTERM', stop);
	});
}

function readPort(value: string, name: string): number {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
		return parsed;
	}

	throw new Error(`${name} must be a TCP port number.`);
}
