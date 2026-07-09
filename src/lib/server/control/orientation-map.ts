/**
 * Purpose: server-side M5 orientation remap for normalized control values.
 *
 * The M5 is physically mounted, so its pitch/roll axes may be exchanged or
 * reversed depending on the mount. This module owns three independent operator
 * booleans that correct the mount into the logical output frame before the Host
 * broadcasts ControlOrientation. It exposes only these booleans; it never reveals
 * raw M5 frames, sensitivity/gain, or calibration offsets. The public
 * ControlOrientation contract is unchanged: only which physical axis/sign feeds
 * each field changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { ControlOrientation } from '$lib/protocol';

export type M5OrientationMapField = 'swapPitchRoll' | 'invertPitch' | 'invertRoll';

export type M5OrientationMap = Readonly<{
	swapPitchRoll: boolean;
	invertPitch: boolean;
	invertRoll: boolean;
}>;

export type M5OrientationMapSnapshot = M5OrientationMap &
	Readonly<{
		isActive: boolean;
	}>;

type OrientationMapListener = () => void;

const ORIENTATION_MAP_FILE = resolve(process.cwd(), '.icaros/m5-orientation-map.json');
const ORIENTATION_MAP_GLOBAL_KEY = Symbol.for('icaros.host.m5OrientationMapper');
const ORIENTATION_MAP_FIELDS: readonly M5OrientationMapField[] = [
	'swapPitchRoll',
	'invertPitch',
	'invertRoll'
];

const DEFAULT_ORIENTATION_MAP: M5OrientationMap = {
	swapPitchRoll: false,
	invertPitch: false,
	invertRoll: false
};

export class M5OrientationMapper {
	#map: M5OrientationMap;
	#listeners = new Set<OrientationMapListener>();
	#persist: boolean;

	constructor(map: M5OrientationMap = DEFAULT_ORIENTATION_MAP, persist = false) {
		this.#map = map;
		this.#persist = persist;
	}

	readMap(): M5OrientationMap {
		return this.#map;
	}

	readSnapshot(): M5OrientationMapSnapshot {
		return {
			...this.#map,
			isActive: isActiveOrientationMap(this.#map)
		};
	}

	setField(field: M5OrientationMapField, enabled: boolean): M5OrientationMap {
		if (this.#map[field] === enabled) {
			return this.#map;
		}

		this.#setMap({ ...this.#map, [field]: enabled });
		return this.#map;
	}

	subscribe(listener: OrientationMapListener): () => void {
		this.#listeners.add(listener);
		return () => {
			this.#listeners.delete(listener);
		};
	}

	#setMap(map: M5OrientationMap): void {
		this.#map = map;
		if (this.#persist) {
			writePersistedM5OrientationMap(map);
		}
		this.#notifyListeners();
	}

	#notifyListeners(): void {
		for (const listener of this.#listeners) {
			listener();
		}
	}
}

export function createM5OrientationMapper(
	map: M5OrientationMap = DEFAULT_ORIENTATION_MAP
): M5OrientationMapper {
	return new M5OrientationMapper(map);
}

export function getM5OrientationMapper(): M5OrientationMapper {
	const globalScope = globalThis as typeof globalThis &
		Record<symbol, M5OrientationMapper | undefined>;
	const existing = globalScope[ORIENTATION_MAP_GLOBAL_KEY];
	if (existing !== undefined) {
		return existing;
	}

	const mapper = new M5OrientationMapper(readPersistedM5OrientationMap(), true);
	globalScope[ORIENTATION_MAP_GLOBAL_KEY] = mapper;
	return mapper;
}

export function isM5OrientationMapField(value: unknown): value is M5OrientationMapField {
	return (
		typeof value === 'string' && ORIENTATION_MAP_FIELDS.includes(value as M5OrientationMapField)
	);
}

export function applyM5OrientationMap(
	control: ControlOrientation,
	map: M5OrientationMap
): ControlOrientation {
	let pitch = control.pitch;
	let roll = control.roll;

	if (map.swapPitchRoll) {
		[pitch, roll] = [roll, pitch];
	}
	if (map.invertPitch) {
		pitch = -pitch;
	}
	if (map.invertRoll) {
		roll = -roll;
	}

	return { ...control, pitch, roll };
}

function readPersistedM5OrientationMap(): M5OrientationMap {
	if (!existsSync(ORIENTATION_MAP_FILE)) {
		return DEFAULT_ORIENTATION_MAP;
	}

	return readOrientationMapObject(readJsonFile(ORIENTATION_MAP_FILE)) ?? DEFAULT_ORIENTATION_MAP;
}

function writePersistedM5OrientationMap(map: M5OrientationMap): void {
	mkdirSync(dirname(ORIENTATION_MAP_FILE), { recursive: true });
	writeFileSync(
		ORIENTATION_MAP_FILE,
		`${JSON.stringify(
			{
				purpose: 'Non-secret M5 orientation remap (axis swap and per-axis inversion).',
				map
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

function readOrientationMapObject(input: unknown): M5OrientationMap | null {
	const candidate = isRecord(input) && isRecord(input.map) ? input.map : input;
	if (!isRecord(candidate)) {
		return null;
	}

	return {
		swapPitchRoll: readBoolean(candidate.swapPitchRoll),
		invertPitch: readBoolean(candidate.invertPitch),
		invertRoll: readBoolean(candidate.invertRoll)
	};
}

function readBoolean(value: unknown): boolean {
	return value === true;
}

function isActiveOrientationMap(map: M5OrientationMap): boolean {
	return map.swapPitchRoll || map.invertPitch || map.invertRoll;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
