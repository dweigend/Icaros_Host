/**
 * Purpose: focused tests for the server-side M5 calibration layer. They prove
 * offsets stay in normalized units and do not leak raw sensor data to clients.
 */
import { describe, expect, it } from 'vitest';

import type { ControlOrientation } from '$lib/protocol';
import {
	applyM5ControlCalibration,
	createM5ControlCalibrator,
	createNeutralControl
} from './index';

const LIVE_CONTROL: ControlOrientation = {
	pitch: 0.35,
	roll: -0.2,
	quality: 1,
	controllerType: 'm5'
};

describe('M5 control calibration', () => {
	it('applies pitch and roll offsets in normalized units', () => {
		const calibrated = applyM5ControlCalibration(LIVE_CONTROL, {
			pitchOffset: 0.1,
			rollOffset: -0.05,
			calibratedAt: null
		});

		expect(calibrated.pitch).toBeCloseTo(0.25);
		expect(calibrated.roll).toBeCloseTo(-0.15);
		expect(calibrated.quality).toBe(1);
		expect(calibrated.controllerType).toBe('m5');
	});

	it('clamps calibrated output to the public -1..1 range', () => {
		expect(
			applyM5ControlCalibration(
				{ pitch: 0.8, roll: -0.8, quality: 1, controllerType: 'm5' },
				{ pitchOffset: -0.8, rollOffset: 0.8, calibratedAt: null }
			)
		).toEqual({
			pitch: 1,
			roll: -1,
			quality: 1,
			controllerType: 'm5'
		});
	});

	it('uses the current live pose as neutral', () => {
		const calibrator = createM5ControlCalibrator();
		calibrator.recordNormalizedInput(LIVE_CONTROL);

		const result = calibrator.calibrateCurrentPoseAsNeutral(new Date('2026-06-24T12:00:00Z'));

		expect(result).toEqual({
			ok: true,
			calibration: {
				pitchOffset: 0.35,
				rollOffset: -0.2,
				calibratedAt: '2026-06-24T12:00:00.000Z'
			}
		});
		expect(calibrator.recordNormalizedInput(LIVE_CONTROL)).toEqual({
			pitch: 0,
			roll: 0,
			quality: 1,
			controllerType: 'm5'
		});
	});

	it('reset restores uncalibrated normalized controls', () => {
		const calibrator = createM5ControlCalibrator({
			pitchOffset: 0.35,
			rollOffset: -0.2,
			calibratedAt: '2026-06-24T12:00:00.000Z'
		});

		calibrator.reset();

		expect(calibrator.recordNormalizedInput(LIVE_CONTROL)).toEqual(LIVE_CONTROL);
		expect(calibrator.readSnapshot().isActive).toBe(false);
	});

	it('keeps missing or stale controls neutral even when offsets exist', () => {
		expect(
			applyM5ControlCalibration(createNeutralControl(), {
				pitchOffset: 0.35,
				rollOffset: -0.2,
				calibratedAt: '2026-06-24T12:00:00.000Z'
			})
		).toEqual(createNeutralControl());
	});
});
