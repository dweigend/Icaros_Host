/**
 * Purpose: focused tests for runtime WebSocket clients used for launch
 * registration, station state, and presence.
 */
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { RuntimeClientRegistry } from './runtime-clients';

describe('RuntimeClientRegistry', () => {
	it('lists concrete runtime clients and marks stale heartbeats', () => {
		const registry = new RuntimeClientRegistry();
		const client = registry.add(createOpenSocket());
		registry.registerHello(
			client,
			{
				role: 'experience',
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local/'
			},
			1_000
		);

		expect(registry.listRuntimeClients()).toEqual([
			{
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local/',
				connectedAt: 1_000,
				lastSeenAt: 1_000,
				status: 'online'
			}
		]);

		expect(registry.markStaleClients(10_000, 8_000)).toBe(true);
		expect(registry.findSelectableClient('quest-client')).toBeNull();
	});

	it('keeps a reconnected client selectable when the old socket closes late', () => {
		const registry = new RuntimeClientRegistry();
		const firstConnection = registry.add(createOpenSocket());
		const firstClient = registry.registerHello(firstConnection, createHelloPayload(), 1_000);
		const secondConnection = registry.add(createOpenSocket());

		registry.registerHello(secondConnection, createHelloPayload(), 2_000);

		expect(registry.remove(firstClient)).toBeNull();
		expect(registry.findSelectableClient('quest-client')).toMatchObject({
			clientId: 'quest-client',
			connectedAt: 2_000
		});
	});
});

function createHelloPayload() {
	return {
		role: 'experience' as const,
		clientId: 'quest-client',
		experienceId: 'mountain-flight',
		title: 'Mountain Flight',
		url: 'https://quest.local/'
	};
}

function createOpenSocket(): WebSocket {
	return {
		readyState: WebSocket.OPEN,
		send: () => {},
		close: () => {}
	} as unknown as WebSocket;
}
