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

import { DEFAULT_HTTPS_DEVICE_WS_PORT } from '../src/lib/server/device/pairing';
import { recordPairedDeviceTcpConnection } from '../src/lib/server/device/usb-setup';
import { resolveServerOpenUrls } from '../src/lib/server/network';
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
	const plainDeviceWsPort = resolvePlainDeviceWsPort(protocol);

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

	const stop = (): void => {
		gateway.dispose();
		server.close();
		plainDeviceServer?.close();
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

function createPlainDeviceServer(
	gateway: ReturnType<typeof createIcarosWebSocketGateway>
): HttpServer {
	const server = createHttpServer((_request, response) => {
		response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end('M5 device WebSocket endpoint only.\n');
	});
	server.on('connection', (socket) => {
		recordPairedDeviceTcpConnection(formatRemoteAddress(socket.remoteAddress, socket.remotePort));
	});
	gateway.attachDeviceServer(server);
	return server;
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

function resolvePlainDeviceWsPort(protocol: RuntimeServerConfig['protocol']): number | null {
	if (protocol !== 'https') {
		return null;
	}

	const explicitOrigin = process.env.ICAROS_DEVICE_WS_ORIGIN?.trim();
	if (explicitOrigin !== undefined && explicitOrigin !== '') {
		return null;
	}

	const configuredPort = process.env.ICAROS_DEVICE_WS_PORT?.trim();
	if (configuredPort === 'none') {
		return null;
	}

	return readPort(configuredPort ?? DEFAULT_HTTPS_DEVICE_WS_PORT, DEFAULT_HTTPS_DEVICE_WS_PORT);
}

function readPort(value: string, fallback: string): number {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
		return parsed;
	}

	return Number(fallback);
}

function formatRemoteAddress(address: string | undefined, port: number | undefined): string | null {
	if (address === undefined) {
		return null;
	}

	return port === undefined ? address : `${address}:${port}`;
}
