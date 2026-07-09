/**
 * Purpose: focused tests for the server-side M5 orientation remap. They prove
 * swap/invert only reshuffle which physical axis/sign feeds pitch and roll while
 * leaving the public ControlOrientation contract and neutral safety intact.
 */
import { describe, expect, it } from 'vitest';

import type { ControlOrientation } from '$lib/protocol';
import { applyM5OrientationMap, createNeutralControl, isM5OrientationMapField } from './index';

const LIVE_CONTROL: ControlOrientation = {
	pitch: 0.35,
	roll: -0.2,
	quality: 1,
	buttonPressed: false,
	buttonDown: false,
	buttonUp: false,
	controllerType: 'm5'
};

describe('M5 orientation map', () => {
	it('is an identity transform when all flags are off', () => {
		const mapped = applyM5OrientationMap(LIVE_CONTROL, {
			swapPitchRoll: false,
			invertPitch: false,
			invertRoll: false
		});

		expect(mapped).toEqual(LIVE_CONTROL);
	});

	it('exchanges pitch and roll when swap is enabled', () => {
		const mapped = applyM5OrientationMap(LIVE_CONTROL, {
			swapPitchRoll: true,
			invertPitch: false,
			invertRoll: false
		});

		expect(mapped.pitch).toBeCloseTo(-0.2);
		expect(mapped.roll).toBeCloseTo(0.35);
	});

	it('negates each output axis independently', () => {
		const mapped = applyM5OrientationMap(LIVE_CONTROL, {
			swapPitchRoll: false,
			invertPitch: true,
			invertRoll: true
		});

		expect(mapped.pitch).toBeCloseTo(-0.35);
		expect(mapped.roll).toBeCloseTo(0.2);
	});

	it('negates the post-swap output axes', () => {
		const mapped = applyM5OrientationMap(LIVE_CONTROL, {
			swapPitchRoll: true,
			invertPitch: true,
			invertRoll: false
		});

		// swap -> pitch=-0.2, roll=0.35 ; then invert pitch -> pitch=0.2
		expect(mapped.pitch).toBeCloseTo(0.2);
		expect(mapped.roll).toBeCloseTo(0.35);
	});

	it('preserves quality and controllerType', () => {
		const mapped = applyM5OrientationMap(LIVE_CONTROL, {
			swapPitchRoll: true,
			invertPitch: true,
			invertRoll: true
		});

		expect(mapped.quality).toBe(1);
		expect(mapped.controllerType).toBe('m5');
	});

	it('keeps a neutral control neutral regardless of flags', () => {
		const mapped = applyM5OrientationMap(createNeutralControl(), {
			swapPitchRoll: true,
			invertPitch: true,
			invertRoll: true
		});

		expect(mapped.pitch).toBeCloseTo(0);
		expect(mapped.roll).toBeCloseTo(0);
		expect(mapped.quality).toBe(0);
		expect(mapped.controllerType).toBe('m5');
	});

	it('recognizes only the three known map fields', () => {
		expect(isM5OrientationMapField('swapPitchRoll')).toBe(true);
		expect(isM5OrientationMapField('invertPitch')).toBe(true);
		expect(isM5OrientationMapField('invertRoll')).toBe(true);
		expect(isM5OrientationMapField('pitch')).toBe(false);
		expect(isM5OrientationMapField(null)).toBe(false);
	});
});
