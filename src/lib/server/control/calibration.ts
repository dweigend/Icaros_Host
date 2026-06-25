/**
 * Purpose: server-side M5 calibration for normalized control values.
 *
 * This module owns local, non-secret pitch/roll offsets in public -1..1 units.
 * It intentionally does not expose raw M5 frames, sensitivity/gain, or axis
 * inversion; Experiences continue to receive only calibrated ControlOrientation
 * payloads through the Host control stream.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ControlOrientation } from '$lib/protocol';
import { createNeutralControl } from './normalizer';

export type M5ControlCalibration = Readonly<{
	pitchOffset: number;
	rollOffset: number;
	calibratedAt: string | null;
}>;

export type M5ControlCalibrationSnapshot = M5ControlCalibration &
	Readonly<{
		hasLivePose: boolean;
		isActive: boolean;
	}>;

export type M5ControlCalibrationResult =
	| Readonly<{ ok: true; calibration: M5ControlCalibration }>
	| Readonly<{ ok: false; message: string }>;

type CalibrationListener = () => void;

const CALIBRATION_FILE = resolve(process.cwd(), '.icaros/m5-calibration.json');
const CALIBRATION_GLOBAL_KEY = Symbol.for('icaros.host.m5ControlCalibrator');
const UNIT_MIN = -1;
const UNIT_MAX = 1;

const DEFAULT_CALIBRATION: M5ControlCalibration = {
	pitchOffset: 0,
	rollOffset: 0,
	calibratedAt: null
};

export class M5ControlCalibrator {
	#calibration: M5ControlCalibration;
	#lastLiveInput: ControlOrientation | null = null;
	#listeners = new Set<CalibrationListener>();
	#persist: boolean;

	constructor(calibration: M5ControlCalibration = DEFAULT_CALIBRATION, persist = false) {
		this.#calibration = calibration;
		this.#persist = persist;
	}

	readSnapshot(): M5ControlCalibrationSnapshot {
		return {
			...this.#calibration,
			hasLivePose: this.#lastLiveInput !== null,
			isActive: isActiveCalibration(this.#calibration)
		};
	}

	readCalibration(): M5ControlCalibration {
		return this.#calibration;
	}

	recordNormalizedInput(control: ControlOrientation): ControlOrientation {
		this.#lastLiveInput = control.quality > 0 ? control : null;
		return applyM5ControlCalibration(control, this.#calibration);
	}

	clearLivePose(): void {
		this.#lastLiveInput = null;
	}

	calibrateCurrentPoseAsNeutral(now: Date = new Date()): M5ControlCalibrationResult {
		if (this.#lastLiveInput === null) {
			return { ok: false, message: 'No live M5 pose is available for calibration.' };
		}

		const calibration: M5ControlCalibration = {
			pitchOffset: clampUnit(this.#lastLiveInput.pitch),
			rollOffset: clampUnit(this.#lastLiveInput.roll),
			calibratedAt: now.toISOString()
		};
		this.#setCalibration(calibration);
		return { ok: true, calibration };
	}

	reset(): M5ControlCalibration {
		this.#setCalibration(DEFAULT_CALIBRATION);
		return this.#calibration;
	}

	subscribe(listener: CalibrationListener): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	#setCalibration(calibration: M5ControlCalibration): void {
		this.#calibration = calibration;
		if (this.#persist) {
			writePersistedM5ControlCalibration(calibration);
		}
		this.#notifyListeners();
	}

	#notifyListeners(): void {
		for (const listener of this.#listeners) {
			listener();
		}
	}
}

export function createM5ControlCalibrator(
	calibration: M5ControlCalibration = DEFAULT_CALIBRATION
): M5ControlCalibrator {
	return new M5ControlCalibrator(calibration);
}

export function getM5ControlCalibrator(): M5ControlCalibrator {
	const globalScope = globalThis as typeof globalThis &
		Record<symbol, M5ControlCalibrator | undefined>;
	const existing = globalScope[CALIBRATION_GLOBAL_KEY];
	if (existing !== undefined) {
		return existing;
	}

	const calibrator = new M5ControlCalibrator(readPersistedM5ControlCalibration(), true);
	globalScope[CALIBRATION_GLOBAL_KEY] = calibrator;
	return calibrator;
}

export function applyM5ControlCalibration(
	control: ControlOrientation,
	calibration: M5ControlCalibration
): ControlOrientation {
	if (control.quality <= 0) {
		return createNeutralControl();
	}

	return {
		...control,
		pitch: clampUnit(control.pitch - calibration.pitchOffset),
		roll: clampUnit(control.roll - calibration.rollOffset)
	};
}

function readPersistedM5ControlCalibration(): M5ControlCalibration {
	if (!existsSync(CALIBRATION_FILE)) {
		return DEFAULT_CALIBRATION;
	}

	return readCalibrationObject(readJsonFile(CALIBRATION_FILE)) ?? DEFAULT_CALIBRATION;
}

function writePersistedM5ControlCalibration(calibration: M5ControlCalibration): void {
	mkdirSync(dirname(CALIBRATION_FILE), { recursive: true });
	writeFileSync(
		CALIBRATION_FILE,
		`${JSON.stringify(
			{
				purpose: 'Non-secret M5 control calibration offsets in normalized -1..1 units.',
				calibration
			},
			null,
			2
		)}\n`,
		'utf8'
	);
}

function readJsonFile(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
}

function readCalibrationObject(input: unknown): M5ControlCalibration | null {
	const candidate = isRecord(input) && isRecord(input.calibration) ? input.calibration : input;
	if (!isRecord(candidate)) {
		return null;
	}

	const pitchOffset = readUnit(candidate.pitchOffset);
	const rollOffset = readUnit(candidate.rollOffset);
	if (pitchOffset === null || rollOffset === null) {
		return null;
	}

	return {
		pitchOffset,
		rollOffset,
		calibratedAt: typeof candidate.calibratedAt === 'string' ? candidate.calibratedAt : null
	};
}

function readUnit(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? clampUnit(value) : null;
}

function isActiveCalibration(calibration: M5ControlCalibration): boolean {
	return calibration.pitchOffset !== 0 || calibration.rollOffset !== 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampUnit(value: number): number {
	return Math.max(UNIT_MIN, Math.min(UNIT_MAX, value));
}
