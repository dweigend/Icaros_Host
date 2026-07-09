/**
 * Purpose: keep public controller output physically calm when M5 input resumes
 * at extreme angles or jumps abruptly. This module stays server-side; clients
 * only see neutral pitch and roll plus low quality.
 */
import type { ControlOrientation } from '$lib/protocol';
import { createNeutralControl } from './normalizer';

const EXTREME_RESUME_UNIT = 0.85;
const EXTREME_STEP_UNIT = 0.9;

/**
 * Returns neutral controls for abrupt or unsafe controller changes.
 *
 * The Icaros is a flight machine with a human lying on it. A reconnected or
 * glitching controller should not make the experience dive immediately; the
 * host flattens that frame and lets later plausible frames resume control.
 */
export function protectControlOrientation(
	previous: ControlOrientation,
	next: ControlOrientation
): ControlOrientation {
	if (next.quality <= 0) {
		return createNeutralControlWithButton(next);
	}

	if (previous.quality <= 0 && isExtreme(next)) {
		return createNeutralControlWithButton(next);
	}

	if (previous.quality > 0 && hasAbruptStep(previous, next)) {
		return createNeutralControlWithButton(next);
	}

	return next;
}

function createNeutralControlWithButton(control: ControlOrientation): ControlOrientation {
	return {
		...createNeutralControl(),
		buttonPressed: control.buttonPressed,
		buttonDown: control.buttonDown,
		buttonUp: control.buttonUp
	};
}

function isExtreme(control: ControlOrientation): boolean {
	return (
		Math.abs(control.pitch) >= EXTREME_RESUME_UNIT || Math.abs(control.roll) >= EXTREME_RESUME_UNIT
	);
}

function hasAbruptStep(previous: ControlOrientation, next: ControlOrientation): boolean {
	return (
		Math.abs(next.pitch - previous.pitch) >= EXTREME_STEP_UNIT ||
		Math.abs(next.roll - previous.roll) >= EXTREME_STEP_UNIT
	);
}
