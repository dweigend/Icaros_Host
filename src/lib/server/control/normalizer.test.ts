/**
 * Purpose: focused tests for the M5 normalization boundary so raw firmware
 * shapes stay out of experience code.
 */
import { describe, expect, it } from 'vitest';

import {
	createNeutralControl,
	isM5OrientationFrame,
	normalizeM5Frame,
	parseM5Frame,
	smoothControlOrientation
} from './normalizer';

describe('normalizeM5Frame', () => {
	it('normalizes pitch and roll to -1..1', () => {
		expect(normalizeM5Frame({ pitch: 45, roll: -45 }, 100)).toMatchObject({
			pitch: 1,
			roll: -1,
			quality: 1,
			safeMode: false
		});
	});

	it('returns neutral safe-mode controls for stale frames', () => {
		expect(normalizeM5Frame({ pitch: 10, roll: 10, timestamp: 0 }, 2_000)).toEqual(
			createNeutralControl(2_000)
		);
	});

	it('parses compatible JSON object frames', () => {
		expect(parseM5Frame('{"pitch":1,"roll":2}')).toEqual({ pitch: 1, roll: 2 });
		expect(parseM5Frame('nope')).toBeNull();
	});

	it('smooths normalized pitch and roll between consecutive controls', () => {
		const previous = normalizeM5Frame({ pitch: 0, roll: 0 }, 100);
		const next = normalizeM5Frame({ pitch: 45, roll: -45 }, 200);

		expect(smoothControlOrientation(previous, next, 0.25)).toMatchObject({
			pitch: 0.25,
			roll: -0.25,
			quality: 1,
			safeMode: false,
			timestamp: 200
		});
	});

	it('can return the unsmoothed control when smoothing is disabled', () => {
		const previous = normalizeM5Frame({ pitch: 0, roll: 0 }, 100);
		const next = normalizeM5Frame({ pitch: 45, roll: -45 }, 200);

		expect(smoothControlOrientation(previous, next, 0.25, false)).toEqual(next);
	});

	it('does not smooth neutral safe-mode controls', () => {
		const previous = normalizeM5Frame({ pitch: 45, roll: -45 }, 100);
		const next = createNeutralControl(200);

		expect(smoothControlOrientation(previous, next, 0.25)).toEqual(next);
	});

	it('accepts neural-flight-template orientation frames', () => {
		const frame = parseM5Frame(
			JSON.stringify({
				type: 'orientation',
				deviceId: 'm5-template-probe',
				role: 'controller',
				seq: 3,
				timeMs: 300,
				quality: 0.75,
				pitch: 30,
				roll: -15,
				yaw: 5
			})
		);

		if (frame === null) {
			throw new Error('expected neural-flight-template orientation frame to parse');
		}

		expect(isM5OrientationFrame(frame)).toBe(true);
		expect(normalizeM5Frame(frame, 1_000)).toMatchObject({
			pitch: 2 / 3,
			roll: -1 / 3,
			quality: 0.75,
			safeMode: false
		});
	});

	it('identifies template register and heartbeat frames as non-control frames', () => {
		const registerFrame = parseM5Frame(
			JSON.stringify({
				type: 'register',
				deviceId: 'm5-template-probe',
				role: 'controller',
				seq: 1,
				timeMs: 100,
				quality: 1,
				firmwareVersion: 'template-probe',
				capabilities: ['orientation']
			})
		);
		const heartbeatFrame = parseM5Frame(
			JSON.stringify({
				type: 'heartbeat',
				deviceId: 'm5-template-probe',
				role: 'controller',
				seq: 2,
				timeMs: 200,
				quality: 1,
				rssi: -42,
				freeHeap: 123456,
				batteryVoltage: 4.1,
				uptimeMs: 200,
				calibrated: true,
				streaming: true
			})
		);

		if (registerFrame === null || heartbeatFrame === null) {
			throw new Error('expected neural-flight-template metadata frames to parse');
		}

		expect(isM5OrientationFrame(registerFrame)).toBe(false);
		expect(isM5OrientationFrame(heartbeatFrame)).toBe(false);
	});
});
