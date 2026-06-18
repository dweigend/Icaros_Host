/**
 * Purpose: define server-owned public control stream names for normalized
 * controls. V1 exposes one default stream backed by the Host-private M5.
 */
export const DEFAULT_CONTROL_STREAM_ID = 'main';
export const DEFAULT_CONTROL_CONTROLLER_ID = 'm5';

export type ControlStreamDefinition = Readonly<{
	streamId: string;
	controllerId: string;
}>;

export type ControlStreamConfig = Readonly<{
	streams: readonly ControlStreamDefinition[];
}>;

const DEFAULT_CONTROL_STREAM: ControlStreamDefinition = {
	streamId: DEFAULT_CONTROL_STREAM_ID,
	controllerId: DEFAULT_CONTROL_CONTROLLER_ID
};

/**
 * Future multi-stream extension point.
 *
 * V1 intentionally exposes only `/ws/control/main`. Add more entries here only
 * when multi-controller routing, operator selection, and tests exist. Do not
 * load local stream config files yet; the Host owns the public stream contract.
 */
const CONTROL_STREAMS: readonly ControlStreamDefinition[] = [DEFAULT_CONTROL_STREAM];

export function createDefaultControlStreamConfig(): ControlStreamConfig {
	return { streams: CONTROL_STREAMS };
}

export function getDefaultControlStream(): ControlStreamDefinition {
	return DEFAULT_CONTROL_STREAM;
}

export function findControlStream(streamId: string): ControlStreamDefinition | null {
	const stream = CONTROL_STREAMS.find((entry) => entry.streamId === streamId);
	if (stream === undefined) {
		return null;
	}

	return stream;
}

export function createControlStreamPath(streamId: string): string {
	const stream = findControlStream(streamId);
	if (stream === null) {
		throw new Error('Control stream id must match a known Host-owned stream.');
	}

	return `/ws/control/${stream.streamId}`;
}
