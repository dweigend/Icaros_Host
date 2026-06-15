/**
 * Purpose: define server-owned public control stream names for normalized
 * controls. M1 exposes one default stream and keeps hardware details private.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DEFAULT_CONTROL_STREAM_ID = 'main';
const DEFAULT_CONTROL_STREAM_LABEL = 'ICAROS_1_M5';
const DEFAULT_CONTROL_INPUT_ID = 'station-a-m5';
const DEFAULT_CONTROL_STREAM_CONFIG_FILE = resolve(process.cwd(), '.icaros/control-streams.json');

export type ControlStreamDefinition = Readonly<{
	streamId: string;
	label: string;
	inputId: string;
}>;

export type ControlStreamConfig = Readonly<{
	streams: readonly ControlStreamDefinition[];
}>;

const DEFAULT_CONTROL_STREAM: ControlStreamDefinition = {
	streamId: DEFAULT_CONTROL_STREAM_ID,
	label: DEFAULT_CONTROL_STREAM_LABEL,
	inputId: DEFAULT_CONTROL_INPUT_ID
};

function readControlStreamConfig(
	filePath: string = DEFAULT_CONTROL_STREAM_CONFIG_FILE
): ControlStreamConfig {
	if (!existsSync(filePath)) {
		return createDefaultControlStreamConfig();
	}

	return parseControlStreamConfig(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function parseControlStreamConfig(input: unknown): ControlStreamConfig {
	if (!isRecord(input) || !Array.isArray(input.streams)) {
		throw new Error('Control stream config must contain a streams array.');
	}

	const streams = input.streams.map(readControlStreamDefinition);
	if (streams.length === 0) {
		throw new Error('Control stream config must define at least one stream.');
	}

	const ids = new Set<string>();
	for (const stream of streams) {
		if (ids.has(stream.streamId)) {
			throw new Error(`Control stream config contains duplicate streamId: ${stream.streamId}.`);
		}
		ids.add(stream.streamId);
	}

	return { streams };
}

export function createDefaultControlStreamConfig(): ControlStreamConfig {
	return { streams: [DEFAULT_CONTROL_STREAM] };
}

export function getDefaultControlStream(
	config: ControlStreamConfig = readControlStreamConfig()
): ControlStreamDefinition {
	return config.streams[0] ?? DEFAULT_CONTROL_STREAM;
}

export function findControlStream(
	streamId: string,
	config: ControlStreamConfig = readControlStreamConfig()
): ControlStreamDefinition | null {
	return config.streams.find((stream) => stream.streamId === streamId) ?? null;
}

export function createControlStreamPath(streamId: string): string {
	if (!isControlStreamId(streamId)) {
		throw new Error('Control stream id must be a non-empty slug.');
	}

	return `/ws/control/${streamId}`;
}

function readControlStreamDefinition(input: unknown): ControlStreamDefinition {
	if (!isRecord(input)) {
		throw new Error('Control stream entries must be objects.');
	}

	const streamId = readControlStreamString(input.streamId, 'streamId');
	const label = readControlStreamString(input.label, 'label');
	const inputId = readControlStreamString(input.inputId, 'inputId');

	if (!isControlStreamId(streamId)) {
		throw new Error('Control stream id must be a non-empty slug.');
	}

	return { streamId, label, inputId };
}

function readControlStreamString(value: unknown, field: string): string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`Control stream ${field} must be a non-empty string.`);
	}

	return value.trim();
}

function isControlStreamId(value: string): boolean {
	return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
