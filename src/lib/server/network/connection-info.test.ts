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
	it('rewrites loopback hosts to LAN addresses without changing desktop socket protocols', () => {
		const connection = resolveConnectionInfo(new URL('http://localhost:5183/'));

		expect(connection.httpOrigin).toBe('http://192.168.50.194:5183');
		expect(connection.wsOrigin).toBe('ws://192.168.50.194:5183');
		expect(createQuestLaunchUrl(connection.httpOrigin)).toBe('https://192.168.50.194:5183/launch');
	});

	it('keeps the Quest launch endpoint on the Host origin', () => {
		const connection = resolveConnectionInfo(new URL('https://192.168.50.194:5183/'));
		const questLaunchUrl = createQuestLaunchUrl(connection.httpOrigin);

		expect(questLaunchUrl).toBe('https://192.168.50.194:5183/launch');
		expect(questLaunchUrl).not.toContain(':5174/launch');
	});

	it('marks HTTP server open URLs as desktop-only in startup output', () => {
		expect(resolveServerOpenUrls('http', '0.0.0.0', 5183)).toEqual([
			{ label: 'Open locally (desktop HTTP)', url: 'http://localhost:5183/' },
			{ label: 'Open on LAN (desktop HTTP)', url: 'http://192.168.50.194:5183/' }
		]);
	});
});
