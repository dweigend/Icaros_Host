/**
 * Purpose: parse and format normalized live messages for the host console. This
 * route-local module is transport-free and never exposes raw M5 frames to the UI.
 */

import type { HostConsoleDebugFrame, HostConsoleDebugStatus } from '$lib/blocks/host-console/types';
import {
	type ControlOrientation,
	type RuntimeClientsPayload,
	type StationState,
	validateControlOrientation,
	validateRuntimeClientsPayload,
	validateStationState
} from '$lib/protocol';

export type RuntimeDebugStatus = HostConsoleDebugStatus;

export type RuntimeRegistryMessage =
	| Readonly<{ type: 'station.state'; payload: StationState }>
	| Readonly<{ type: 'runtime.clients'; payload: RuntimeClientsPayload }>;

export type RuntimeDebugFrame = HostConsoleDebugFrame;

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

export {
	formatAge,
	toQualityPercent,
	toUnitPercent
} from '$lib/blocks/host-console/format';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
