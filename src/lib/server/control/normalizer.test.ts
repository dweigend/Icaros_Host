/**
 * Purpose: focused tests for the M5 normalization boundary so raw firmware
 * shapes stay out of experience code.
 */
import { describe, expect, it } from 'vitest';

import { createNeutralControl, normalizeM5Frame, parseM5Frame } from './normalizer';

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
});
