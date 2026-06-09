/**
 * Purpose: focused tests for the host console runtime debug parser so malformed
 * socket messages do not enter the operator UI.
 */
import { describe, expect, it } from 'vitest';

import { parseRuntimeDebugMessage, toQualityPercent, toUnitPercent } from './runtime-debug';

describe('runtime debug helpers', () => {
	it('parses normalized control.orientation messages', () => {
		const message = parseRuntimeDebugMessage(
			JSON.stringify({
				type: 'control.orientation',
				payload: {
					pitch: 0.4,
					roll: -0.2,
					quality: 0.8,
					safeMode: false
				}
			})
		);

		expect(message).toEqual({
			type: 'control.orientation',
			payload: {
				pitch: 0.4,
				roll: -0.2,
				quality: 0.8,
				safeMode: false
			}
		});
	});

	it('parses station.state messages', () => {
		expect(
			parseRuntimeDebugMessage(
				JSON.stringify({
					type: 'station.state',
					payload: { activeExperienceId: 'mountain-flight', activeClientId: 'quest-client' }
				})
			)
		).toEqual({
			type: 'station.state',
			payload: { activeExperienceId: 'mountain-flight', activeClientId: 'quest-client' }
		});
	});

	it('parses runtime.clients messages', () => {
		expect(
			parseRuntimeDebugMessage(
				JSON.stringify({
					type: 'runtime.clients',
					payload: {
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
				})
			)
		).toEqual({
			type: 'runtime.clients',
			payload: {
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

	it('drops invalid runtime messages', () => {
		expect(parseRuntimeDebugMessage('nope')).toBeNull();
		expect(parseRuntimeDebugMessage(JSON.stringify({ type: 'control.orientation' }))).toBeNull();
		expect(
			parseRuntimeDebugMessage(
				JSON.stringify({
					type: 'control.orientation',
					payload: {
						pitch: 0,
						roll: 0,
						quality: 1,
						safeMode: 'nope'
					}
				})
			)
		).toBeNull();
	});

	it('converts normalized values to display percentages', () => {
		expect(toUnitPercent(-1)).toBe(0);
		expect(toUnitPercent(0)).toBe(50);
		expect(toUnitPercent(1)).toBe(100);
		expect(toQualityPercent(0.8)).toBe(80);
	});
});
