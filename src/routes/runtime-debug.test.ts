/**
 * Purpose: focused tests for the host console runtime debug parser so malformed
 * socket messages do not enter the operator UI.
 */
import { describe, expect, it } from 'vitest';

import {
	parseControlStreamMessage,
	parseRuntimeRegistryMessage,
	toQualityPercent,
	toUnitPercent
} from './runtime-debug';

describe('runtime debug helpers', () => {
	it('parses normalized control.orientation messages', () => {
		const message = parseControlStreamMessage(
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
			pitch: 0.4,
			roll: -0.2,
			quality: 0.8,
			safeMode: false
		});
	});

	it('parses station.state messages', () => {
		expect(
			parseRuntimeRegistryMessage(
				JSON.stringify({
					type: 'station.state',
					payload: {
						selectedExperienceId: 'mountain-flight',
						selectedLaunchClientId: 'quest-client'
					}
				})
			)
		).toEqual({
			type: 'station.state',
			payload: { selectedExperienceId: 'mountain-flight', selectedLaunchClientId: 'quest-client' }
		});
	});

	it('parses runtime.clients messages', () => {
		expect(
			parseRuntimeRegistryMessage(
				JSON.stringify({
					type: 'runtime.clients',
					payload: {
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
				})
			)
		).toEqual({
			type: 'runtime.clients',
			payload: {
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

	it('drops invalid runtime messages', () => {
		expect(parseControlStreamMessage('nope')).toBeNull();
		expect(parseControlStreamMessage(JSON.stringify({ type: 'control.orientation' }))).toBeNull();
		expect(parseRuntimeRegistryMessage(JSON.stringify({ type: 'control.orientation' }))).toBeNull();
		expect(
			parseControlStreamMessage(
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
