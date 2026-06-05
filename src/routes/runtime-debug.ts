/**
 * Purpose: parse and format normalized runtime messages for the host console
 * debug panel. This route-local module is transport-free and never exposes raw
 * M5 frames to the UI.
 */
import type { ControlOrientation, StationState } from '$lib/protocol';

export type RuntimeDebugStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type RuntimeDebugMessage =
	| Readonly<{ type: 'control.orientation'; payload: ControlOrientation }>
	| Readonly<{ type: 'station.state'; payload: StationState }>;

export type RuntimeDebugFrame = Readonly<{
	id: number;
	receivedAt: number;
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;

export function parseRuntimeDebugMessage(input: string): RuntimeDebugMessage | null {
	try {
		const parsed: unknown = JSON.parse(input);

		if (!isRecord(parsed) || typeof parsed.type !== 'string') {
			return null;
		}

		if (parsed.type === 'control.orientation') {
			const payload = readControlOrientation(parsed.payload);
			return payload === null ? null : { type: 'control.orientation', payload };
		}

		if (parsed.type === 'station.state') {
			const payload = readStationState(parsed.payload);
			return payload === null ? null : { type: 'station.state', payload };
		}

		return null;
	} catch {
		return null;
	}
}

export function createRuntimeDebugFrame(
	id: number,
	control: ControlOrientation,
	receivedAt: number
): RuntimeDebugFrame {
	return {
		id,
		receivedAt,
		pitch: control.pitch,
		roll: control.roll,
		quality: control.quality,
		safeMode: control.safeMode
	};
}

export function formatSignedUnit(value: number): string {
	const sign = value > 0 ? '+' : '';
	return `${sign}${value.toFixed(3)}`;
}

export function formatAge(milliseconds: number): string {
	if (milliseconds < 1_000) {
		return `${Math.max(0, Math.round(milliseconds))} ms`;
	}

	return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function toUnitPercent(value: number): number {
	return Math.round(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
}

export function toQualityPercent(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function readControlOrientation(payload: unknown): ControlOrientation | null {
	if (!isRecord(payload) || payload.source !== 'm5') {
		return null;
	}

	const pitch = readFiniteNumber(payload.pitch);
	const roll = readFiniteNumber(payload.roll);
	const quality = readFiniteNumber(payload.quality);
	const timestamp = readFiniteNumber(payload.timestamp);

	if (
		pitch === null ||
		roll === null ||
		quality === null ||
		timestamp === null ||
		typeof payload.safeMode !== 'boolean'
	) {
		return null;
	}

	return {
		pitch,
		roll,
		quality,
		source: 'm5',
		safeMode: payload.safeMode,
		timestamp
	};
}

function readStationState(payload: unknown): StationState | null {
	if (!isRecord(payload)) {
		return null;
	}

	if (payload.activeExperienceId === null || typeof payload.activeExperienceId === 'string') {
		return { activeExperienceId: payload.activeExperienceId };
	}

	return null;
}

function readFiniteNumber(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
