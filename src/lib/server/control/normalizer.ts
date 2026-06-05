/**
 * Purpose: translate M5-compatible raw frames into neutral normalized controls.
 * This boundary keeps firmware shapes away from experiences and rendering code.
 */
import type { ControlOrientation } from '$lib/protocol';

// 1. Tuning constants

export const STALE_AFTER_MS = 1_000;

/**
 * Enables smoothing for already normalized values.
 * true = pitch and roll are softened across frames.
 * false = each normalized frame is forwarded without smoothing.
 */
export const SMOOTH_NORMALIZED_CONTROLS = true;

/**
 * Smoothing factor for pitch and roll in the range 0..1.
 * 1 = no visible smoothing, 0 = stays almost entirely at the previous value.
 */
export const NORMALIZED_CONTROL_SMOOTHING = 0.25;

const MAX_ANGLE_DEGREES = 45;

// Chapter: raw input model

export type M5RawFrame = Readonly<{
	type?: string;
	pitch?: number;
	roll?: number;
	angleX?: number;
	angleY?: number;
	rotationX?: number;
	rotationY?: number;
	timestamp?: number;
	timeMs?: number;
	quality?: number;
}>;

// 2. Public normalization API

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
		quality: readQuality(frame.quality),
		source: 'm5',
		safeMode: false,
		timestamp
	};
}

export function smoothControlOrientation(
	previous: ControlOrientation,
	next: ControlOrientation,
	smoothing: number = NORMALIZED_CONTROL_SMOOTHING,
	enabled: boolean = SMOOTH_NORMALIZED_CONTROLS
): ControlOrientation {
	if (!enabled || previous.safeMode || next.safeMode) {
		return next;
	}

	const amount = readSmoothing(smoothing);

	return {
		...next,
		pitch: lerp(previous.pitch, next.pitch, amount),
		roll: lerp(previous.roll, next.roll, amount)
	};
}

export function isM5OrientationFrame(frame: M5RawFrame): boolean {
	return (
		firstNumber(frame.pitch, frame.angleY, frame.rotationY) !== null &&
		firstNumber(frame.roll, frame.angleX, frame.rotationX) !== null
	);
}

// 3. Raw frame parsing

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

// Chapter: private helpers

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

function lerp(from: number, to: number, amount: number): number {
	return from + (to - from) * amount;
}

function readSmoothing(value: number): number {
	if (!Number.isFinite(value)) {
		return NORMALIZED_CONTROL_SMOOTHING;
	}

	return Math.max(0, Math.min(1, value));
}

function readQuality(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return 1;
	}

	return Math.max(0, Math.min(1, value));
}
