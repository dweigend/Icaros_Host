/**
 * Purpose: translate M5-compatible raw frames into neutral normalized controls.
 *
 * This module is the Host boundary between firmware-shaped device data and the
 * public experience control API. It parses raw JSON frames, accepts the known M5
 * orientation field aliases, rejects missing or stale orientation data with a
 * neutral safe-mode control, normalizes pitch and roll from degrees into -1..1,
 * clamps quality into 0..1, and optionally smooths consecutive valid controls.
 *
 * Experiences should only receive the resulting ControlOrientation values and
 * never need to know which raw M5 field names were present on the device frame.
 */
import type { ControlOrientation } from '$lib/protocol';

export const STALE_AFTER_MS = 1_000;

const MAX_ANGLE_DEGREES = 45;
const DEFAULT_SMOOTHING = 0.25;

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

type OrientationDegrees = Readonly<{
	pitch: number;
	roll: number;
}>;

export function createNeutralControl(): ControlOrientation {
	return {
		pitch: 0,
		roll: 0,
		quality: 0,
		safeMode: true
	};
}

export function normalizeM5Frame(frame: M5RawFrame, now: number = Date.now()): ControlOrientation {
	if (isStale(frame, now)) {
		return createNeutralControl();
	}

	const orientation = readOrientationDegrees(frame);

	if (orientation === null) {
		return createNeutralControl();
	}

	return {
		pitch: clamp(orientation.pitch / MAX_ANGLE_DEGREES, -1, 1),
		roll: clamp(orientation.roll / MAX_ANGLE_DEGREES, -1, 1),
		quality: readQuality(frame.quality),
		safeMode: false
	};
}

export function smoothControlOrientation(
	previous: ControlOrientation,
	next: ControlOrientation,
	smoothing: number = DEFAULT_SMOOTHING,
	enabled = true
): ControlOrientation {
	if (!enabled || previous.safeMode || next.safeMode) {
		return next;
	}

	const amount = Number.isFinite(smoothing) ? clamp(smoothing, 0, 1) : DEFAULT_SMOOTHING;

	return {
		...next,
		pitch: lerp(previous.pitch, next.pitch, amount),
		roll: lerp(previous.roll, next.roll, amount)
	};
}

export function isM5OrientationFrame(frame: M5RawFrame): boolean {
	return readOrientationDegrees(frame) !== null;
}

export function parseM5Frame(input: string): M5RawFrame | null {
	try {
		const parsed: unknown = JSON.parse(input);
		return isFrameObject(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function readOrientationDegrees(frame: M5RawFrame): OrientationDegrees | null {
	const pitch = firstFiniteNumber(frame.pitch, frame.angleY, frame.rotationY);
	const roll = firstFiniteNumber(frame.roll, frame.angleX, frame.rotationX);

	return pitch === null || roll === null ? null : { pitch, roll };
}

function isStale(frame: M5RawFrame, now: number): boolean {
	return typeof frame.timestamp === 'number' && now - frame.timestamp > STALE_AFTER_MS;
}

function firstFiniteNumber(...values: readonly unknown[]): number | null {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}

	return null;
}

function readQuality(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : 1;
}

function isFrameObject(value: unknown): value is M5RawFrame {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number): number {
	return from + (to - from) * amount;
}
