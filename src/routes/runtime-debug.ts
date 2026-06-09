/**
 * Purpose: parse and format normalized live messages for the host console. This
 * route-local module is transport-free and never exposes raw M5 frames to the UI.
 */
import {
	type ControlOrientation,
	type RuntimeClientsPayload,
	type StationState,
	validateControlOrientation,
	validateRuntimeClientsPayload,
	validateStationState
} from '$lib/protocol';

export type RuntimeDebugStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type RuntimeRegistryMessage =
	| Readonly<{ type: 'station.state'; payload: StationState }>
	| Readonly<{ type: 'runtime.clients'; payload: RuntimeClientsPayload }>;

export type RuntimeDebugFrame = Readonly<{
	id: number;
	receivedAt: number;
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;

export function parseControlStreamMessage(input: string): ControlOrientation | null {
	try {
		const parsed: unknown = JSON.parse(input);

		if (!isRecord(parsed) || typeof parsed.type !== 'string') {
			return null;
		}

		if (parsed.type === 'control.orientation') {
			const validation = validateControlOrientation(parsed.payload);
			return validation.ok ? validation.value : null;
		}
	} catch {
		return null;
	}

	return null;
}

export function parseRuntimeRegistryMessage(input: string): RuntimeRegistryMessage | null {
	try {
		const parsed: unknown = JSON.parse(input);

		if (!isRecord(parsed) || typeof parsed.type !== 'string') {
			return null;
		}

		if (parsed.type === 'station.state') {
			const validation = validateStationState(parsed.payload);
			return validation.ok ? { type: 'station.state', payload: validation.value } : null;
		}

		if (parsed.type === 'runtime.clients') {
			const validation = validateRuntimeClientsPayload(parsed.payload);
			return validation.ok ? { type: 'runtime.clients', payload: validation.value } : null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
