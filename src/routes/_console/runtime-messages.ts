/**
 * Purpose: validate public runtime WebSocket messages consumed by the Host
 * console. This parser accepts only normalized protocol payloads.
 */
import type { ControlOrientation, RuntimeClientsPayload, StationState } from '$lib/protocol';
import {
	validateControlOrientation,
	validateRuntimeClientsPayload,
	validateStationState
} from '$lib/protocol';

export type RuntimeRegistryMessage =
	| Readonly<{ type: 'station.state'; payload: StationState }>
	| Readonly<{ type: 'runtime.clients'; payload: RuntimeClientsPayload }>;

export function parseControlStreamMessage(input: string): ControlOrientation | null {
	const parsed = parseJsonRecord(input);
	if (parsed === null || parsed.type !== 'control.orientation') {
		return null;
	}

	const validation = validateControlOrientation(parsed.payload);
	return validation.ok ? validation.value : null;
}

export function parseRuntimeRegistryMessage(input: string): RuntimeRegistryMessage | null {
	const parsed = parseJsonRecord(input);
	if (parsed === null || typeof parsed.type !== 'string') {
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
}

function parseJsonRecord(input: string): Record<string, unknown> | null {
	try {
		const parsed: unknown = JSON.parse(input);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
