/**
 * Purpose: focused protocol-boundary tests for runtime client registration.
 * These cases pin down the HTTPS-only handshake before data enters host state.
 */
import { describe, expect, it } from 'vitest';

import {
	validateClientHeartbeatPayload,
	validateClientHelloPayload,
	validateClientRegisteredPayload,
	validateRuntimeClientsPayload
} from './validators';

describe('runtime client validators', () => {
	it('accepts HTTPS client hello payloads', () => {
		expect(
			validateClientHelloPayload({
				role: 'experience',
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local:5174/',
				userAgent: 'Quest Browser'
			})
		).toEqual({
			ok: true,
			value: {
				role: 'experience',
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local:5174/',
				userAgent: 'Quest Browser'
			}
		});
	});

	it('rejects HTTP client hello URLs', () => {
		expect(
			validateClientHelloPayload({
				role: 'experience',
				clientId: 'desktop-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'http://localhost:5174/'
			})
		).toEqual({
			ok: false,
			error: 'client.hello url must be an https URL'
		});
	});

	it('accepts concrete runtime client heartbeats', () => {
		expect(validateClientHeartbeatPayload({ clientId: 'quest-client' })).toEqual({
			ok: true,
			value: { clientId: 'quest-client' }
		});
	});

	it('accepts full client registration acknowledgements', () => {
		expect(
			validateClientRegisteredPayload({
				clientId: 'quest-client',
				active: false,
				activeClientId: null
			})
		).toEqual({
			ok: true,
			value: {
				clientId: 'quest-client',
				active: false,
				activeClientId: null
			}
		});
	});

	it('accepts HTTPS runtime client snapshots', () => {
		expect(
			validateRuntimeClientsPayload({
				activeClientId: 'quest-client',
				clients: [
					{
						clientId: 'quest-client',
						experienceId: 'mountain-flight',
						title: 'Mountain Flight',
						url: 'https://quest.local/',
						connectedAt: 1,
						lastSeenAt: 2,
						status: 'online'
					}
				]
			})
		).toEqual({
			ok: true,
			value: {
				activeClientId: 'quest-client',
				clients: [
					{
						clientId: 'quest-client',
						experienceId: 'mountain-flight',
						title: 'Mountain Flight',
						url: 'https://quest.local/',
						connectedAt: 1,
						lastSeenAt: 2,
						status: 'online'
					}
				]
			}
		});
	});
});
