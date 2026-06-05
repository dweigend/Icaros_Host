/**
 * Purpose: translate M5-compatible raw frames into neutral normalized controls.
 * This boundary keeps firmware shapes away from experiences and rendering code.
 */
import type { ControlOrientation } from '$lib/protocol';

export const STALE_AFTER_MS = 1_000;
const MAX_ANGLE_DEGREES = 45;

export type M5RawFrame = Readonly<{
	pitch?: number;
	roll?: number;
	angleX?: number;
	angleY?: number;
	rotationX?: number;
	rotationY?: number;
	timestamp?: number;
}>;

export function createNeutralControl(timestamp: number = Date.now()): ControlOrientation {
	return {
		pitch: 0,
		roll: 0,
		quality: 0,
		source: 'm5',
		safeMode: true,
		timestamp
	};
}

export function normalizeM5Frame(frame: M5RawFrame, now: number = Date.now()): ControlOrientation {
	const timestamp = typeof frame.timestamp === 'number' ? frame.timestamp : now;
	const age = now - timestamp;

	if (age > STALE_AFTER_MS) {
		return createNeutralControl(now);
	}

	const pitchDegrees = firstNumber(frame.pitch, frame.angleY, frame.rotationY);
	const rollDegrees = firstNumber(frame.roll, frame.angleX, frame.rotationX);

	if (pitchDegrees === null || rollDegrees === null) {
		return createNeutralControl(now);
	}

	return {
		pitch: clampUnit(pitchDegrees / MAX_ANGLE_DEGREES),
		roll: clampUnit(rollDegrees / MAX_ANGLE_DEGREES),
		quality: 1,
		source: 'm5',
		safeMode: false,
		timestamp
	};
}

export function parseM5Frame(input: string): M5RawFrame | null {
	try {
		const parsed: unknown = JSON.parse(input);

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return null;
		}

		return parsed;
	} catch {
		return null;
	}
}

function firstNumber(...values: readonly unknown[]): number | null {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}

	return null;
}

function clampUnit(value: number): number {
	return Math.max(-1, Math.min(1, value));
}
