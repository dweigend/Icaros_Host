/**
 * Purpose: focused tests for M5 pairing URL resolution so USB setup does not
 * accidentally configure the controller against a UI-only Vite origin.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPairedDeviceWebSocketUrl, resolveDeviceWebSocketOrigin } from './pairing';

describe('resolveDeviceWebSocketOrigin', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('prefers the explicit device WebSocket origin', () => {
		vi.stubEnv('ICAROS_DEVICE_WS_ORIGIN', 'ws://192.168.50.194:8787/');
		vi.stubEnv('ICAROS_DEVICE_WS_PORT', '5183');

		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:8787'
		);
	});

	it('uses the configured device port on the request LAN host', () => {
		vi.stubEnv('ICAROS_DEVICE_WS_PORT', '8787');

		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:8787'
		);
	});

	it('does not leak the Vite dev port into hardware pairing URLs', () => {
		expect(resolveDeviceWebSocketOrigin('ws://192.168.50.194:5173')).toBe(
			'ws://192.168.50.194:5183'
		);
	});

	it('keeps the gateway port and downgrades HTTPS runtime origins for plain M5 firmware', () => {
		expect(resolveDeviceWebSocketOrigin('wss://192.168.50.194:5183')).toBe(
			'ws://192.168.50.194:5183'
		);
	});
});

describe('createPairedDeviceWebSocketUrl', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('creates a paired device path on the resolved origin', () => {
		const url = new URL(createPairedDeviceWebSocketUrl('ws://192.168.50.194:5173'));

		expect(url.origin).toBe('ws://192.168.50.194:5183');
		expect(url.pathname).toBe('/ws/device');
		expect(url.searchParams.get('pairing')).toEqual(expect.any(String));
	});
});
