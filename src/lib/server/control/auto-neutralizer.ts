/**
 * Purpose: neutralize the mechanically tilted Icaros rest pose before controls
 * reach public experience streams. This module owns only the small server-side
 * stability window; it does not replace manual calibration or change payloads.
 */
import type { ControlOrientation } from '$lib/protocol';

const DEFAULT_REST_PITCH = 0.02;
const DEFAULT_REST_ROLL = -0.8;
const DEFAULT_STABLE_DURATION_MS = 5_000;
const DEFAULT_REST_TOLERANCE = 0.08;
const DEFAULT_MAX_FRAME_GAP_MS = 1_000;

export type AutoNeutralizerConfig = Readonly<{
	restPitch: number;
	restRoll: number;
	stableDurationMs: number;
	tolerance: number;
	maxFrameGapMs: number;
}>;

export type AutoNeutralizerStatus = 'idle' | 'stabilizing' | 'neutralized';

export type AutoNeutralizerSnapshot = Readonly<{
	status: AutoNeutralizerStatus;
	stableSinceMs: number | null;
	lastFrameAtMs: number | null;
}>;

export type AutoNeutralizerResult = Readonly<{
	control: ControlOrientation;
	neutralized: boolean;
	status: AutoNeutralizerStatus;
}>;

export type AutoNeutralizer = Readonly<{
	process(control: ControlOrientation, now: number): AutoNeutralizerResult;
	reset(): void;
	snapshot(): AutoNeutralizerSnapshot;
}>;

export const DEFAULT_AUTO_NEUTRALIZER_CONFIG: AutoNeutralizerConfig = {
	restPitch: DEFAULT_REST_PITCH,
	restRoll: DEFAULT_REST_ROLL,
	stableDurationMs: DEFAULT_STABLE_DURATION_MS,
	tolerance: DEFAULT_REST_TOLERANCE,
	maxFrameGapMs: DEFAULT_MAX_FRAME_GAP_MS
};

export function createAutoNeutralizer(
	config: AutoNeutralizerConfig = DEFAULT_AUTO_NEUTRALIZER_CONFIG
): AutoNeutralizer {
	let stableSinceMs: number | null = null;
	let lastFrameAtMs: number | null = null;
	let status: AutoNeutralizerStatus = 'idle';

	function resetWindow(): void {
		stableSinceMs = null;
		status = 'idle';
	}

	function reset(): void {
		lastFrameAtMs = null;
		resetWindow();
	}

	function process(control: ControlOrientation, now: number): AutoNeutralizerResult {
		if (control.quality <= 0 || !Number.isFinite(now)) {
			reset();
			return createResult(control, status);
		}

		if (lastFrameAtMs !== null && !hasPlausibleFrameTiming(lastFrameAtMs, now, config)) {
			resetWindow();
		}

		lastFrameAtMs = now;

		if (!isNearRestPose(control, config)) {
			resetWindow();
			return createResult(control, status);
		}

		if (stableSinceMs === null) {
			stableSinceMs = now;
			status = 'stabilizing';
			return createResult(control, status);
		}

		if (now - stableSinceMs < config.stableDurationMs) {
			status = 'stabilizing';
			return createResult(control, status);
		}

		status = 'neutralized';
		return createResult(
			{
				...control,
				pitch: 0,
				roll: 0
			},
			status
		);
	}

	function snapshot(): AutoNeutralizerSnapshot {
		return {
			status,
			stableSinceMs,
			lastFrameAtMs
		};
	}

	return {
		process,
		reset,
		snapshot
	};
}

function createResult(
	control: ControlOrientation,
	status: AutoNeutralizerStatus
): AutoNeutralizerResult {
	return {
		control,
		neutralized: status === 'neutralized',
		status
	};
}

function hasPlausibleFrameTiming(
	previousMs: number,
	nowMs: number,
	config: AutoNeutralizerConfig
): boolean {
	const gapMs = nowMs - previousMs;
	return gapMs >= 0 && gapMs <= config.maxFrameGapMs;
}

function isNearRestPose(control: ControlOrientation, config: AutoNeutralizerConfig): boolean {
	return (
		Math.abs(control.pitch - config.restPitch) <= config.tolerance &&
		Math.abs(control.roll - config.restRoll) <= config.tolerance
	);
}
