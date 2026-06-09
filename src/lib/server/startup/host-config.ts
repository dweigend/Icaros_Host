/**
 * Purpose: read and validate Host bootstrap configuration without importing
 * runtime pairing, WebSocket, or SvelteKit server modules.
 */
import { createServer } from 'node:net';

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_HOST_PORT = 5183;
const DEFAULT_DEVICE_WS_PORT = '5184';
const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';

export type HostBootstrapConfig = Readonly<{
	host: string;
	port: number;
	deviceWsPort: string;
	deviceWsOrigin: string;
	tlsKeyFile: string;
	tlsCertFile: string;
}>;

export function readHostBootstrapConfig(env: NodeJS.ProcessEnv = process.env): HostBootstrapConfig {
	const host = readOptionalString(env.HOST) ?? DEFAULT_HOST;
	const port = readTcpPort(readOptionalString(env.PORT) ?? String(DEFAULT_HOST_PORT), 'PORT');
	const deviceWsOrigin = readOptionalString(env.ICAROS_DEVICE_WS_ORIGIN) ?? '';
	const deviceWsPort = readDeviceWsPort(
		readOptionalString(env.ICAROS_DEVICE_WS_PORT) ?? DEFAULT_DEVICE_WS_PORT
	);

	if (deviceWsOrigin === '' && deviceWsPort !== 'none' && Number(deviceWsPort) === port) {
		throw new Error('ICAROS_DEVICE_WS_PORT must differ from PORT.');
	}

	return {
		host,
		port,
		deviceWsPort,
		deviceWsOrigin,
		tlsKeyFile: readOptionalString(env.ICAROS_TLS_KEY_FILE) ?? DEFAULT_TLS_KEY_FILE,
		tlsCertFile: readOptionalString(env.ICAROS_TLS_CERT_FILE) ?? DEFAULT_TLS_CERT_FILE
	};
}

export async function resolveHostBootstrapPorts(
	env: NodeJS.ProcessEnv = process.env,
	mode: 'dynamic' | 'strict' = 'dynamic',
	isPortAvailable: (host: string, port: number) => Promise<boolean> = canBindTcpPort
): Promise<HostBootstrapConfig> {
	const config = readHostBootstrapConfig(env);
	let port = config.port;
	let deviceWsPort = config.deviceWsPort;
	const portExplicit = readOptionalString(env.PORT) !== null;
	const deviceWsPortExplicit = readOptionalString(env.ICAROS_DEVICE_WS_PORT) !== null;
	const devicePort =
		config.deviceWsOrigin === '' && deviceWsPort !== 'none' ? Number(deviceWsPort) : null;

	if (!(await isPortAvailable(config.host, port))) {
		if (mode === 'strict' || portExplicit) {
			throw new Error(`PORT ${port} is already in use.`);
		}

		port = await findOpenPort(config.host, DEFAULT_HOST_PORT + 1, isPortAvailable, devicePort);
	}

	if (devicePort !== null && !(await isPortAvailable(config.host, devicePort))) {
		if (mode === 'strict' || deviceWsPortExplicit) {
			throw new Error(`ICAROS_DEVICE_WS_PORT ${devicePort} is already in use.`);
		}

		const nextDevicePort = await findOpenPort(
			config.host,
			Number(DEFAULT_DEVICE_WS_PORT) + 1,
			isPortAvailable,
			port
		);
		deviceWsPort = String(nextDevicePort);
	}

	return { ...config, port, deviceWsPort };
}

export function createRuntimeServerEnv(config: HostBootstrapConfig): Record<string, string> {
	return {
		HOST: config.host,
		PORT: String(config.port),
		ICAROS_DEVICE_WS_PORT: config.deviceWsPort,
		ICAROS_DEVICE_WS_ORIGIN: config.deviceWsOrigin,
		ICAROS_TLS_KEY_FILE: config.tlsKeyFile,
		ICAROS_TLS_CERT_FILE: config.tlsCertFile
	};
}

function readDeviceWsPort(value: string): string {
	if (value === 'none') {
		return value;
	}

	return String(readTcpPort(value, 'ICAROS_DEVICE_WS_PORT'));
}

async function findOpenPort(
	host: string,
	startAt: number,
	isPortAvailable: (host: string, port: number) => Promise<boolean>,
	excludedPort: number | null
): Promise<number> {
	for (let port = startAt; port <= 65_535; port += 1) {
		if (port !== excludedPort && (await isPortAvailable(host, port))) {
			return port;
		}
	}

	throw new Error('Could not find a free TCP port for Icaros Host startup.');
}

async function canBindTcpPort(host: string, port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = createServer();
		server.once('error', () => resolve(false));
		server.listen(port, host, () => {
			server.close(() => resolve(true));
		});
	});
}

function readTcpPort(value: string, name: string): number {
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
		return parsed;
	}

	throw new Error(`${name} must be a TCP port number.`);
}

function readOptionalString(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed === undefined || trimmed === '' ? null : trimmed;
}
