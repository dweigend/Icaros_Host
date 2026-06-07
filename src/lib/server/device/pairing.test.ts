/**
 * Purpose: focused tests for M5 pairing URL resolution so USB setup does not
 * accidentally configure the controller against a UI-only Vite origin.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
	createDevicePairingTokenFingerprint,
	createPairedDeviceWebSocketUrl,
	resolveDeviceWebSocketOrigin
} from './pairing';

describe('resolveDeviceWebSocketOrigin', () => {
	afterEach(() => {
		restoreEnv();
	});

	it('prefers the explicit device WebSocket origin', () => {
		stubEnv('ICAROS_DEVICE_WS_ORIGIN', 'ws://192.168.50.194:8787/');
		stubEnv('ICAROS_DEVICE_WS_PORT', '5183');

		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:8787'
		);
	});

	it('rejects non-plain explicit device WebSocket origins', () => {
		stubEnv('ICAROS_DEVICE_WS_ORIGIN', 'wss://192.168.50.194:8787/');

		expect(() => resolveDeviceWebSocketOrigin('wss://192.168.50.194:5183')).toThrow(
			'ICAROS_DEVICE_WS_ORIGIN must use ws:// for the M5 device boundary.'
		);
	});

	it('rejects explicit device origins with paths', () => {
		stubEnv('ICAROS_DEVICE_WS_ORIGIN', 'ws://192.168.50.194:8787/ws/device');

		expect(() => resolveDeviceWebSocketOrigin('wss://192.168.50.194:5183')).toThrow(
			'ICAROS_DEVICE_WS_ORIGIN must be an origin like ws://host:port.'
		);
	});

	it('uses the configured device port on the request LAN host', () => {
		stubEnv('ICAROS_DEVICE_WS_PORT', '8787');

		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:8787'
		);
	});

	it('does not invent a device URL when the plain listener is disabled', () => {
		stubEnv('ICAROS_DEVICE_WS_PORT', 'none');

		expect(() => resolveDeviceWebSocketOrigin('wss://192.168.50.194:5183')).toThrow(
			'ICAROS_DEVICE_WS_PORT=none requires ICAROS_DEVICE_WS_ORIGIN for M5 pairing URLs.'
		);
	});

	it('does not leak the Vite dev port into hardware pairing URLs', () => {
		expect(resolveDeviceWebSocketOrigin('ws://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:5184'
		);
	});

	it('uses a separate plain device port for HTTPS runtime origins', () => {
		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5183')).toBe(
			'ws://192.168.50.194:5184'
		);
	});

	it('routes plain runtime origins to the M5 device port too', () => {
		expect(resolveDeviceWebSocketOrigin('ws://192.168.50.194:5183')).toBe(
			'ws://192.168.50.194:5184'
		);
	});
});

describe('createPairedDeviceWebSocketUrl', () => {
	afterEach(() => {
		restoreEnv();
	});

	it('creates a paired device path on the resolved origin', () => {
		const url = new URL(createPairedDeviceWebSocketUrl('ws://192.168.50.194:5173'));

		expect(url.origin).toBe('ws://192.168.50.194:5184');
		expect(url.pathname).toBe('/ws/device');
		expect(url.searchParams.get('pairing')).toEqual(expect.any(String));
	});
});

const originalEnv = new Map<string, string | undefined>();

function stubEnv(key: string, value: string): void {
	if (!originalEnv.has(key)) {
		originalEnv.set(key, process.env[key]);
	}

	process.env[key] = value;
}

function restoreEnv(): void {
	for (const [key, value] of originalEnv) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	originalEnv.clear();
}

describe('createDevicePairingTokenFingerprint', () => {
	it('creates a stable non-secret fingerprint for diagnostics', () => {
		expect(createDevicePairingTokenFingerprint('dev-m5-token')).toMatch(/^[a-f0-9]{12}$/);
		expect(createDevicePairingTokenFingerprint('dev-m5-token')).toBe(
			createDevicePairingTokenFingerprint('dev-m5-token')
		);
	});

	it('distinguishes missing and empty token candidates', () => {
		expect(createDevicePairingTokenFingerprint(null)).toBe('missing');
		expect(createDevicePairingTokenFingerprint('')).toBe('empty');
	});
});
