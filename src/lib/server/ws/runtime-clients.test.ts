/**
 * Purpose: focused runtime client registry tests. They pin down selection
 * helpers without crossing into WebSocket gateway lifecycle behavior.
 */
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';

import { DEFAULT_EXPERIENCE_ID } from '$lib/protocol';
import { RuntimeClientRegistry } from './runtime-clients';

describe('RuntimeClientRegistry', () => {
	it('finds one online default experience client', () => {
		const registry = new RuntimeClientRegistry();
		const client = registry.add({} as WebSocket);

		registry.registerHello(
			client,
			{
				role: 'experience',
				clientId: 'quest-default',
				experienceId: DEFAULT_EXPERIENCE_ID,
				title: 'Icaros Default World',
				url: 'https://default-world.local/'
			},
			1
		);

		expect(registry.findSingleOnlineClientByExperienceId(DEFAULT_EXPERIENCE_ID)?.clientId).toBe(
			'quest-default'
		);
	});

	it('does not choose between multiple online default experience clients', () => {
		const registry = new RuntimeClientRegistry();

		registry.registerHello(
			registry.add({} as WebSocket),
			{
				role: 'experience',
				clientId: 'quest-default-a',
				experienceId: DEFAULT_EXPERIENCE_ID,
				title: 'Icaros Default World A',
				url: 'https://default-world-a.local/'
			},
			1
		);
		registry.registerHello(
			registry.add({} as WebSocket),
			{
				role: 'experience',
				clientId: 'quest-default-b',
				experienceId: DEFAULT_EXPERIENCE_ID,
				title: 'Icaros Default World B',
				url: 'https://default-world-b.local/'
			},
			2
		);

		expect(registry.findSingleOnlineClientByExperienceId(DEFAULT_EXPERIENCE_ID)).toBeNull();
	});

	it('ignores stale default experience clients', () => {
		const registry = new RuntimeClientRegistry();
		const client = registry.add({} as WebSocket);

		registry.registerHello(
			client,
			{
				role: 'experience',
				clientId: 'quest-default',
				experienceId: DEFAULT_EXPERIENCE_ID,
				title: 'Icaros Default World',
				url: 'https://default-world.local/'
			},
			1
		);
		registry.markStaleClients(10_000, 1_000);

		expect(registry.findSingleOnlineClientByExperienceId(DEFAULT_EXPERIENCE_ID)).toBeNull();
	});
});
