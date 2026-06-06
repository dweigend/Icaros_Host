/**
 * Purpose: own the M5 device pairing secret for `/ws/device`.
 *
 * The token is intentionally separate from runtime client registration. Only a
 * controller configured over the server-side USB setup path should know this
 * URL token; browser/WebXR clients continue to use `/ws/runtime`.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DEVICE_PAIRING_QUERY_KEY = 'pairing';
export const DEFAULT_HTTPS_DEVICE_WS_PORT = '5184';
const FALLBACK_TOKEN_BYTES = 18;
const PERSISTED_PAIRING_TOKEN_FILE = resolve(
	process.cwd(),
	'.icaros/secrets/m5-device-pairing-token'
);
const DEVICE_PAIRING_TOKEN_GLOBAL_KEY = Symbol.for('icaros.host.devicePairingToken');

const pairingToken = readSharedPairingToken();

export function readDevicePairingToken(): string {
	return pairingToken;
}

export function readDevicePairingTokenFingerprint(): string {
	return createDevicePairingTokenFingerprint(pairingToken);
}

export function createDevicePairingTokenFingerprint(candidate: string | null): string {
	if (candidate === null || candidate.length === 0) {
		return candidate === null ? 'missing' : 'empty';
	}

	return createHash('sha256').update(candidate).digest('hex').slice(0, 12);
}

export function createPairedDeviceWebSocketUrl(wsOrigin: string): string {
	const url = new URL('/ws/device', resolveDeviceWebSocketOrigin(wsOrigin));
	url.searchParams.set(DEVICE_PAIRING_QUERY_KEY, pairingToken);
	return url.toString();
}

export function resolveDeviceWebSocketOrigin(wsOrigin: string): string {
	const configuredOrigin = process.env.ICAROS_DEVICE_WS_ORIGIN?.trim();
	if (configuredOrigin !== undefined && configuredOrigin !== '') {
		return readConfiguredDeviceWebSocketOrigin(configuredOrigin);
	}

	const url = new URL(wsOrigin);
	url.protocol = 'ws:';
	const configuredPort = process.env.ICAROS_DEVICE_WS_PORT?.trim();
	if (configuredPort !== undefined && configuredPort !== '') {
		url.port = configuredPort;
		return url.origin;
	}

	url.port = DEFAULT_HTTPS_DEVICE_WS_PORT;
	return url.origin;
}

function readConfiguredDeviceWebSocketOrigin(origin: string): string {
	const url = new URL(origin);
	if (url.protocol !== 'ws:') {
		throw new Error('ICAROS_DEVICE_WS_ORIGIN must use ws:// for the M5 device boundary.');
	}

	if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
		throw new Error('ICAROS_DEVICE_WS_ORIGIN must be an origin like ws://host:port.');
	}

	return url.origin;
}

export function isDevicePairingRequest(candidate: string | null): boolean {
	if (candidate === null || candidate.length === 0) {
		return false;
	}

	return constantTimeEquals(candidate, pairingToken);
}

export function redactDevicePairingToken(input: string): string {
	try {
		const url = new URL(input);
		if (url.searchParams.has(DEVICE_PAIRING_QUERY_KEY)) {
			url.searchParams.set(DEVICE_PAIRING_QUERY_KEY, 'redacted');
		}
		return url.toString();
	} catch {
		return input.replace(/([?&]pairing=)[^&\s]+/g, '$1redacted');
	}
}

function readConfiguredToken(): string | null {
	const value = process.env.ICAROS_DEVICE_PAIRING_TOKEN?.trim();
	return value === undefined || value === '' ? null : value;
}

function readSharedPairingToken(): string {
	const configuredToken = readConfiguredToken();
	const globalScope = globalThis as typeof globalThis & Record<symbol, string | undefined>;
	if (configuredToken !== null) {
		globalScope[DEVICE_PAIRING_TOKEN_GLOBAL_KEY] = configuredToken;
		return configuredToken;
	}

	const existingToken = globalScope[DEVICE_PAIRING_TOKEN_GLOBAL_KEY];
	if (existingToken !== undefined) {
		return existingToken;
	}

	const persistedToken = readPersistedToken();
	if (persistedToken !== null) {
		globalScope[DEVICE_PAIRING_TOKEN_GLOBAL_KEY] = persistedToken;
		return persistedToken;
	}

	const generatedToken = randomBytes(FALLBACK_TOKEN_BYTES).toString('base64url');
	writePersistedToken(generatedToken);
	globalScope[DEVICE_PAIRING_TOKEN_GLOBAL_KEY] = generatedToken;
	return generatedToken;
}

function readPersistedToken(): string | null {
	if (!existsSync(PERSISTED_PAIRING_TOKEN_FILE)) {
		return null;
	}

	const token = readFileSync(PERSISTED_PAIRING_TOKEN_FILE, 'utf8').trim();
	return token === '' ? null : token;
}

function writePersistedToken(token: string): void {
	mkdirSync(dirname(PERSISTED_PAIRING_TOKEN_FILE), { recursive: true, mode: 0o700 });
	writeFileSync(PERSISTED_PAIRING_TOKEN_FILE, `${token}\n`, { encoding: 'utf8', mode: 0o600 });
}

function constantTimeEquals(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}
