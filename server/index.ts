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
import { createInterface } from 'node:readline/promises';

import { DEFAULT_HTTPS_DEVICE_WS_PORT } from '../src/lib/server/device/pairing';
import { resolveServerOpenUrls, type ServerOpenUrl } from '../src/lib/server/network';
import { createIcarosWebSocketGateway } from '../src/lib/server/ws';

const DEFAULT_HOST_PORT = 5183;
const BUILD_HANDLER_URL = new URL('../build/handler.js', import.meta.url);

const requestedPort = readPort(process.env.PORT ?? String(DEFAULT_HOST_PORT), 'PORT');
const host = process.env.HOST ?? '0.0.0.0';
const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';
const PROTOCOL_HEADER = 'x-forwarded-proto';

type RuntimeServer = HttpServer | ReturnType<typeof createHttpsServer>;
type StartupSummary = Readonly<{
	protocol: 'https';
	host: string;
	hostPort: number;
	openUrls: readonly ServerOpenUrl[];
	deviceWsPort: number | null;
}>;

async function start(): Promise<void> {
	process.env.PROTOCOL_HEADER ??= PROTOCOL_HEADER;

	ensureBuildHandler();
	const { handler } = await import(BUILD_HANDLER_URL.href);
	const tlsOptions = loadTlsOptions();
	const protocol = 'https';
	const server = createHttpsServer(tlsOptions, createProtocolAwareHandler(handler));
	const gateway = createIcarosWebSocketGateway();
	let plainDeviceServer: HttpServer | null = null;

	gateway.attach(server);

	try {
		plainDeviceServer = await listenRuntimeServers({ server, gateway, protocol });
		await waitForShutdown({ gateway, server, plainDeviceServer });
	} catch (error) {
		gateway.dispose();
		closeServer(server);
		closeServer(plainDeviceServer);
		throw error;
	}
}

async function listenRuntimeServers({
	server,
	gateway,
	protocol
}: Readonly<{
	server: ReturnType<typeof createHttpsServer>;
	gateway: ReturnType<typeof createIcarosWebSocketGateway>;
	protocol: 'https';
}>): Promise<HttpServer | null> {
	const port = await listenOnPreferredPort(server, requestedPort, host, 'Host HTTPS');
	const openUrls = resolveServerOpenUrls(protocol, host, port);

	const plainDeviceWsPort = resolvePlainDeviceWsPort(port);
	if (plainDeviceWsPort === null) {
		printStartupSummary({ protocol, host, hostPort: port, openUrls, deviceWsPort: null });
		return null;
	}

	const plainDeviceServer = createPlainDeviceServer(gateway);
	const selectedDeviceWsPort = await listenOnPreferredPort(
		plainDeviceServer,
		plainDeviceWsPort,
		host,
		'M5 plain device WebSocket'
	);
	printStartupSummary({
		protocol,
		host,
		hostPort: port,
		openUrls,
		deviceWsPort: selectedDeviceWsPort
	});
	return plainDeviceServer;
}

function printStartupSummary(summary: StartupSummary): void {
	const localUrl = summary.openUrls.find((openUrl) => openUrl.label === 'Open locally');
	const remoteUrls = summary.openUrls.filter((openUrl) => openUrl.label !== 'Open locally');
	const clientOrigin = readPrimaryClientOrigin(remoteUrls, localUrl);

	console.log('');
	console.log('Icaros Host is running');
	console.log(`  Host HTTPS listener: ${summary.protocol}://${summary.host}:${summary.hostPort}`);
	console.log('');
	printLocalAccess(localUrl);
	printRemoteAccess(remoteUrls, clientOrigin);
	printClientConnections(clientOrigin);
	printDeviceConnection(clientOrigin, summary.deviceWsPort);
	console.log('');
}

function printLocalAccess(localUrl: ServerOpenUrl | undefined): void {
	if (localUrl === undefined) {
		return;
	}

	console.log('Local operator UI:');
	console.log(`  Open Host locally: ${localUrl.url}`);
	console.log('');
}

function printRemoteAccess(remoteUrls: readonly ServerOpenUrl[], clientOrigin: string): void {
	console.log('Remote / LAN access:');
	if (remoteUrls.length === 0) {
		console.log(`  Host URL: ${clientOrigin}/`);
	} else {
		for (const remoteUrl of remoteUrls) {
			console.log(`  Host URL: ${remoteUrl.url}`);
		}
	}
	console.log(`  Headset launch URL: ${new URL('/launch', clientOrigin).toString()}`);
	console.log('');
}

function printClientConnections(clientOrigin: string): void {
	const wsOrigin = toWebSocketOrigin(clientOrigin);

	console.log('Connect client via:');
	console.log(`  Host origin argument: bun start ${clientOrigin}`);
	console.log(`  Runtime registration: ${wsOrigin}/ws/runtime`);
	console.log(`  Control stream: ${wsOrigin}/ws/control/main`);
	console.log('');
}

function printDeviceConnection(clientOrigin: string, deviceWsPort: number | null): void {
	console.log('M5 controller WebSocket:');
	if (deviceWsPort === null) {
		console.log('  Plain device socket disabled; using configured ICAROS_DEVICE_WS_ORIGIN.');
		return;
	}

	const deviceUrl = new URL(clientOrigin);
	deviceUrl.protocol = 'ws:';
	deviceUrl.port = String(deviceWsPort);
	deviceUrl.pathname = '/ws/device';
	console.log(`  Device socket: ${deviceUrl.toString()}`);
}

function readPrimaryClientOrigin(
	remoteUrls: readonly ServerOpenUrl[],
	localUrl: ServerOpenUrl | undefined
): string {
	const [remoteUrl] = remoteUrls;
	return trimTrailingSlash(remoteUrl?.url ?? localUrl?.url ?? 'https://localhost:5183/');
}

function toWebSocketOrigin(httpOrigin: string): string {
	const url = new URL(httpOrigin);
	url.protocol = 'wss:';
	url.pathname = '/';
	return trimTrailingSlash(url.toString());
}

function trimTrailingSlash(value: string): string {
	return value.endsWith('/') ? value.slice(0, -1) : value;
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

try {
	await start();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}

function ensureBuildHandler(): void {
	if (existsSync(BUILD_HANDLER_URL)) {
		return;
	}

	throw new Error(
		'Missing SvelteKit build output at build/handler.js. Run `bun run build` before `bun start`.'
	);
}

function createProtocolAwareHandler(handler: RequestListener): RequestListener {
	return (request, response) => {
		request.headers[PROTOCOL_HEADER] ??= 'https';
		handler(request, response);
	};
}

function listenOnPort(server: RuntimeServer, port: number, host: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const handleError = (error: Error): void => {
			server.off('listening', handleListening);
			reject(error);
		};
		const handleListening = (): void => {
			server.off('error', handleError);
			resolve();
		};

		server.once('error', handleError);
		server.once('listening', handleListening);
		server.listen(port, host);
	});
}

async function listenOnPreferredPort(
	server: RuntimeServer,
	preferredPort: number,
	host: string,
	label: string
): Promise<number> {
	try {
		await listenOnPort(server, preferredPort, host);
		return preferredPort;
	} catch (error) {
		if (!isAddressInUseError(error)) {
			throw error;
		}

		const fallbackPort = await findFreePort(host);
		const allowed = await askUseFallbackPort(label, preferredPort, fallbackPort);
		if (!allowed) {
			throw new Error(`${label} port ${preferredPort} is already in use.`);
		}

		await listenOnPort(server, fallbackPort, host);
		return fallbackPort;
	}
}

async function findFreePort(host: string): Promise<number> {
	const probe = createHttpServer();

	return new Promise((resolve, reject) => {
		const handleError = (error: Error): void => {
			probe.off('listening', handleListening);
			reject(error);
		};
		const handleListening = (): void => {
			probe.off('error', handleError);
			const address = probe.address();
			probe.close(() => {
				if (address !== null && typeof address === 'object') {
					resolve(address.port);
					return;
				}

				reject(new Error('Could not find a free TCP port.'));
			});
		};

		probe.once('error', handleError);
		probe.once('listening', handleListening);
		probe.listen(0, host);
	});
}

async function askUseFallbackPort(
	label: string,
	preferredPort: number,
	fallbackPort: number
): Promise<boolean> {
	if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
		throw new Error(`${label} port ${preferredPort} is already in use.`);
	}

	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await readline.question(
			`${label} port ${preferredPort} is already in use. Use free port ${fallbackPort} instead? [Y/n] `
		);
		const normalizedAnswer = answer.trim().toLowerCase();
		return normalizedAnswer === '' || normalizedAnswer === 'y' || normalizedAnswer === 'yes';
	} finally {
		readline.close();
	}
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

function resolvePlainDeviceWsPort(hostPort: number): number | null {
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

	if (devicePort === hostPort) {
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

function closeServer(server: RuntimeServer | null): void {
	if (server?.listening === true) {
		server.close();
	}
}

function readPort(value: string, name: string): number {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
		return parsed;
	}

	throw new Error(`${name} must be a TCP port number.`);
}

function isAddressInUseError(error: unknown): boolean {
	return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}
