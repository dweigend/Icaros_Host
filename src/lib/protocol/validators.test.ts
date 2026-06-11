/**
 * Purpose: focused protocol-boundary tests for runtime client registration.
 * These cases pin down the HTTPS-only handshake before data enters host state.
 */
import { describe, expect, it } from 'vitest';

import {
	validateClientHeartbeatPayload,
	validateClientHelloPayload,
	validateClientRegisteredPayload,
	validateControlOrientation,
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
				selectedForLaunch: false,
				selectedLaunchClientId: null
			})
		).toEqual({
			ok: true,
			value: {
				clientId: 'quest-client',
				selectedForLaunch: false,
				selectedLaunchClientId: null
			}
		});
	});

	it('accepts HTTPS runtime client snapshots', () => {
		expect(
			validateRuntimeClientsPayload({
				selectedLaunchClientId: 'quest-client',
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
				selectedLaunchClientId: 'quest-client',
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

	it('accepts the small public control orientation payload', () => {
		expect(
			validateControlOrientation({
				pitch: 0.25,
				roll: -0.5,
				quality: 0.8,
				safeMode: false
			})
		).toEqual({
			ok: true,
			value: {
				pitch: 0.25,
				roll: -0.5,
				quality: 0.8,
				safeMode: false
			}
		});
	});

	it('rejects invalid public control orientation values', () => {
		expect(
			validateControlOrientation({
				pitch: 1.25,
				roll: 0,
				quality: 1,
				safeMode: false
			})
		).toEqual({
			ok: false,
			error: 'control.orientation pitch must be a -1..1 number'
		});

		expect(
			validateControlOrientation({
				pitch: 0,
				roll: 0,
				quality: 1
			})
		).toEqual({
			ok: false,
			error: 'control.orientation safeMode must be boolean'
		});
	});
});
