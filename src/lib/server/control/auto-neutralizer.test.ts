/**
 * Purpose: focused sequence tests for the server-side rest-pose neutralizer.
 * They prove timing, reset behavior, and public-payload preservation without
 * involving WebSocket transport.
 */
import { describe, expect, it } from 'vitest';

import {
	type AutoNeutralizer,
	type AutoNeutralizerResult,
	createAutoNeutralizer,
	DEFAULT_AUTO_NEUTRALIZER_CONFIG
} from './index';

const REST_CONTROL = {
	pitch: DEFAULT_AUTO_NEUTRALIZER_CONFIG.restPitch,
	roll: DEFAULT_AUTO_NEUTRALIZER_CONFIG.restRoll,
	quality: 0.8,
	controllerType: 'm5'
} as const;

describe('auto-neutralizer', () => {
	it('keeps a stable rest pose unchanged before the five second window completes', () => {
		const neutralizer = createAutoNeutralizer();

		const result = processRestFrames(neutralizer, [0, 1_000, 2_000, 3_000, 4_000, 4_999]);

		expect(result).toEqual({
			control: REST_CONTROL,
			neutralized: false,
			status: 'stabilizing'
		});
	});

	it('neutralizes pitch and roll after five stable seconds while preserving quality', () => {
		const neutralizer = createAutoNeutralizer();

		const result = processRestFrames(neutralizer, [0, 1_000, 2_000, 3_000, 4_000, 5_000]);

		expect(result).toEqual({
			control: {
				...REST_CONTROL,
				pitch: 0,
				roll: 0
			},
			neutralized: true,
			status: 'neutralized'
		});
	});

	it('deactivates neutralization when the pose leaves the configured tolerance', () => {
		const neutralizer = createAutoNeutralizer();
		const movedControl = {
			...REST_CONTROL,
			roll: REST_CONTROL.roll + DEFAULT_AUTO_NEUTRALIZER_CONFIG.tolerance + 0.01
		};

		processRestFrames(neutralizer, [0, 1_000, 2_000, 3_000, 4_000, 5_000]);

		expect(neutralizer.process(movedControl, 5_100)).toEqual({
			control: movedControl,
			neutralized: false,
			status: 'idle'
		});
		expect(
			processRestFrames(neutralizer, [5_200, 6_200, 7_200, 8_200, 9_200, 10_200]).neutralized
		).toBe(true);
	});

	it('resets the stability window for stale or neutral quality controls', () => {
		const neutralizer = createAutoNeutralizer();
		const neutralQualityControl = {
			...REST_CONTROL,
			quality: 0
		};

		processRestFrames(neutralizer, [0, 1_000, 2_000, 3_000, 4_000, 5_000]);

		expect(neutralizer.process(neutralQualityControl, 5_100)).toEqual({
			control: neutralQualityControl,
			neutralized: false,
			status: 'idle'
		});
		expect(
			processRestFrames(neutralizer, [5_200, 6_200, 7_200, 8_200, 9_200, 10_199]).neutralized
		).toBe(false);
		expect(neutralizer.process(REST_CONTROL, 10_200).neutralized).toBe(true);
	});

	it('requires continuous plausible frames across the stability window', () => {
		const neutralizer = createAutoNeutralizer();
		const gapResetAt = 900 + DEFAULT_AUTO_NEUTRALIZER_CONFIG.maxFrameGapMs + 1;

		neutralizer.process(REST_CONTROL, 0);
		neutralizer.process(REST_CONTROL, 900);
		neutralizer.process(REST_CONTROL, gapResetAt);

		expect(
			processRestFrames(neutralizer, [
				gapResetAt + 1_000,
				gapResetAt + 2_000,
				gapResetAt + 3_000,
				gapResetAt + 4_000,
				gapResetAt + 4_999
			]).neutralized
		).toBe(false);
		expect(neutralizer.process(REST_CONTROL, gapResetAt + 5_000).neutralized).toBe(true);
	});
});

function processRestFrames(
	neutralizer: AutoNeutralizer,
	timestamps: readonly number[]
): AutoNeutralizerResult {
	let result: AutoNeutralizerResult | null = null;

	for (const timestamp of timestamps) {
		result = neutralizer.process(REST_CONTROL, timestamp);
	}

	if (result === null) {
		throw new Error('Expected at least one timestamp');
	}

	return result;
}
