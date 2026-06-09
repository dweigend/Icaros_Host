/**
 * Purpose: read and validate Host bootstrap configuration without importing
 * runtime pairing, WebSocket, or SvelteKit server modules.
 */

export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_HOST_PORT = 5183;
export const DEFAULT_DEVICE_WS_PORT = '5184';
export const DEFAULT_TLS_CERT_FILE = '.certs/icaros-host.pem';
export const DEFAULT_TLS_KEY_FILE = '.certs/icaros-host-key.pem';

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
		throw new Error(
			'ICAROS_DEVICE_WS_PORT must differ from PORT, or use ICAROS_DEVICE_WS_PORT=none.'
		);
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
