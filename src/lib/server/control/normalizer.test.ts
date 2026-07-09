/**
 * Purpose: focused tests for server-side M5 control translation. These cases
 * keep the public stream small while proving that safety stays inside the Host.
 */
import { describe, expect, it } from 'vitest';

import {
	createNeutralControl,
	normalizeM5Frame,
	protectControlOrientation,
	smoothControlOrientation
} from './index';

describe('control normalization', () => {
	it('publishes the small public control shape for valid M5 frames', () => {
		expect(normalizeM5Frame({ pitch: 22.5, roll: -11.25, quality: 0.8 })).toEqual({
			pitch: 0.5,
			roll: -0.25,
			quality: 0.8,
			buttonPressed: false,
			buttonDown: false,
			buttonUp: false,
			controllerType: 'm5'
		});
	});

	it('publishes button state and edge flags from M5 frames', () => {
		expect(
			normalizeM5Frame({
				pitch: 0,
				roll: 0,
				buttonPressed: true,
				buttonDown: true,
				buttonUp: false
			})
		).toEqual({
			pitch: 0,
			roll: 0,
			quality: 1,
			buttonPressed: true,
			buttonDown: true,
			buttonUp: false,
			controllerType: 'm5'
		});
	});

	it('uses neutral controls for missing or stale orientation data', () => {
		expect(normalizeM5Frame({ type: 'heartbeat' })).toEqual(createNeutralControl());
		expect(normalizeM5Frame({ pitch: 10, roll: 10, timestamp: 1_000 }, 2_500)).toEqual(
			createNeutralControl()
		);
	});

	it('smooths live controls from neutral instead of jumping immediately', () => {
		expect(
			smoothControlOrientation(createNeutralControl(), normalizeM5Frame({ pitch: 18, roll: 0 }))
		).toEqual({
			pitch: 0.1,
			roll: 0,
			quality: 1,
			buttonPressed: false,
			buttonDown: false,
			buttonUp: false,
			controllerType: 'm5'
		});
	});
});

describe('control safety', () => {
	it('keeps a reconnecting controller neutral when it resumes at an extreme angle', () => {
		const next = normalizeM5Frame({ pitch: 45, roll: 0, quality: 1 });

		expect(protectControlOrientation(createNeutralControl(), next)).toEqual(createNeutralControl());
	});

	it('keeps abrupt outlier steps server-side by returning neutral controls', () => {
		const previous = normalizeM5Frame({ pitch: 0, roll: 0, quality: 1 });
		const next = normalizeM5Frame({ pitch: 45, roll: 0, quality: 1, buttonDown: true });

		expect(protectControlOrientation(previous, next)).toEqual({
			...createNeutralControl(),
			buttonDown: true
		});
	});
});
