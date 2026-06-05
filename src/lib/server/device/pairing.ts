/**
 * Purpose: own the M5 device pairing secret for `/ws/device`.
 *
 * The token is intentionally separate from runtime client registration. Only a
 * controller configured over the server-side USB setup path should know this
 * URL token; browser/WebXR clients continue to use `/ws/runtime`.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

const DEVICE_PAIRING_QUERY_KEY = 'pairing';
const DEFAULT_DEVICE_WS_PORT = '5183';
const VITE_DEV_PORT = '5173';
const FALLBACK_TOKEN_BYTES = 18;

const pairingToken =
	readConfiguredToken() ?? randomBytes(FALLBACK_TOKEN_BYTES).toString('base64url');

export function readDevicePairingToken(): string {
	return pairingToken;
}

export function createPairedDeviceWebSocketUrl(wsOrigin: string): string {
	const url = new URL('/ws/device', resolveDeviceWebSocketOrigin(wsOrigin));
	url.searchParams.set(DEVICE_PAIRING_QUERY_KEY, pairingToken);
	return url.toString();
}

export function resolveDeviceWebSocketOrigin(wsOrigin: string): string {
	const configuredOrigin = process.env.ICAROS_DEVICE_WS_ORIGIN?.trim();
	if (configuredOrigin !== undefined && configuredOrigin !== '') {
		return new URL(configuredOrigin).origin;
	}

	const url = new URL(wsOrigin);
	url.protocol = 'ws:';
	const configuredPort = process.env.ICAROS_DEVICE_WS_PORT?.trim();
	if (configuredPort !== undefined && configuredPort !== '') {
		url.port = configuredPort;
		return url.origin;
	}

	if (url.port === VITE_DEV_PORT) {
		url.port = DEFAULT_DEVICE_WS_PORT;
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

function constantTimeEquals(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);

	if (leftBuffer.length !== rightBuffer.length) {
		return false;
	}

	return timingSafeEqual(leftBuffer, rightBuffer);
}
