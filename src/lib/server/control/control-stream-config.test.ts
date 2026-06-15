/**
 * Purpose: pin down the M1 public control stream naming contract without
 * implementing multi-controller routing.
 */
import { describe, expect, it } from 'vitest';

import {
	createControlStreamPath,
	createDefaultControlStreamConfig,
	findControlStream,
	getDefaultControlStream,
	parseControlStreamConfig
} from './control-stream-config';

describe('control stream config', () => {
	it('uses main as the default public control stream', () => {
		const config = createDefaultControlStreamConfig();

		expect(config).toEqual({
			streams: [
				{
					streamId: 'main',
					label: 'ICAROS_1_M5',
					inputId: 'station-a-m5'
				}
			]
		});
		expect(getDefaultControlStream(config).streamId).toBe('main');
		expect(createControlStreamPath('main')).toBe('/ws/control/main');
	});

	it('finds configured stream definitions by public stream id', () => {
		const config = parseControlStreamConfig({
			streams: [
				{
					streamId: 'main',
					label: 'Primary Controls',
					inputId: 'station-a-m5'
				},
				{
					streamId: 'training',
					label: 'Training Controls',
					inputId: 'station-a-m5'
				}
			]
		});

		expect(findControlStream('training', config)).toEqual({
			streamId: 'training',
			label: 'Training Controls',
			inputId: 'station-a-m5'
		});
		expect(findControlStream('missing', config)).toBeNull();
	});

	it('rejects invalid or duplicate stream ids', () => {
		expect(() =>
			parseControlStreamConfig({
				streams: [{ streamId: 'Main Stream', label: 'Main', inputId: 'station-a-m5' }]
			})
		).toThrow('Control stream id must be a non-empty slug.');

		expect(() =>
			parseControlStreamConfig({
				streams: [
					{ streamId: 'main', label: 'Main', inputId: 'station-a-m5' },
					{ streamId: 'main', label: 'Duplicate', inputId: 'station-a-m5' }
				]
			})
		).toThrow('Control stream config contains duplicate streamId: main.');
	});
});
