/**
 * Purpose: executable checks for LAN-safe host URL derivation. The Host owns
 * `/launch`; experience clients run on separate origins and must never receive
 * a launch path.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({
	networkInterfaces: () => ({
		en0: [{ family: 'IPv4', internal: false, address: '192.168.50.194' }]
	})
}));

import {
	createQuestLaunchUrl,
	resolveConnectionInfo,
	resolveServerOpenUrls
} from './connection-info';

describe('resolveConnectionInfo', () => {
	it('rewrites loopback hosts to LAN HTTPS and WSS origins', () => {
		const connection = resolveConnectionInfo(new URL('http://localhost:5183/'));

		expect(connection.httpOrigin).toBe('https://192.168.50.194:5183');
		expect(connection.wsOrigin).toBe('wss://192.168.50.194:5183');
		expect(createQuestLaunchUrl(connection.httpOrigin)).toBe('https://192.168.50.194:5183/launch');
	});

	it('rewrites IPv6 loopback hosts without double-wrapping brackets', () => {
		const connection = resolveConnectionInfo(new URL('https://[::1]:5183/'));

		expect(connection.httpOrigin).toBe('https://192.168.50.194:5183');
		expect(connection.wsOrigin).toBe('wss://192.168.50.194:5183');
	});

	it('keeps non-local IPv6 hosts wrapped once', () => {
		const connection = resolveConnectionInfo(new URL('https://[2001:db8::1]:5183/'));

		expect(connection.httpOrigin).toBe('https://[2001:db8::1]:5183');
		expect(connection.wsOrigin).toBe('wss://[2001:db8::1]:5183');
	});

	it('keeps the Quest launch endpoint on the Host origin', () => {
		const connection = resolveConnectionInfo(new URL('https://192.168.50.194:5183/'));
		const questLaunchUrl = createQuestLaunchUrl(connection.httpOrigin);

		expect(questLaunchUrl).toBe('https://192.168.50.194:5183/launch');
		expect(questLaunchUrl).not.toContain(':5174/launch');
	});

	it('prints only HTTPS server open URLs in startup output', () => {
		expect(resolveServerOpenUrls('https', '0.0.0.0', 5183)).toEqual([
			{ label: 'Open locally', url: 'https://localhost:5183/' },
			{ label: 'Open on LAN', url: 'https://192.168.50.194:5183/' }
		]);
	});
});
