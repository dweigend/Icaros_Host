/**
 * Purpose: browser-side public control stream client. It subscribes to
 * normalized controls and does not know about launch registration.
 */
import { type ControlOrientation, validateControlOrientation } from '$lib/protocol';
import { type BrowserSocketOrigin, resolveBrowserSocketUrl } from './browser-socket-url';

const DEFAULT_CONTROL_STREAM_ID = 'main';

export type OrientationListener = (control: ControlOrientation) => void;

export type ControlStreamClientOptions = Readonly<{
	hostOrigin?: BrowserSocketOrigin;
	controlOrigin?: BrowserSocketOrigin;
	streamId?: string;
	controlPath?: string;
}>;

export type IcarosControlStreamClient = Readonly<{
	start(): void;
	dispose(): void;
	onOrientation(listener: OrientationListener): () => void;
}>;

export function createIcarosControlStreamClient(
	options: ControlStreamClientOptions = {}
): IcarosControlStreamClient {
	let socket: WebSocket | null = null;
	const listeners = new Set<OrientationListener>();

	function handleMessage(data: unknown): void {
		const control = typeof data === 'string' ? readControl(data) : null;
		if (control === null) {
			return;
		}

		for (const listener of listeners) {
			listener(control);
		}
	}

	return {
		start(): void {
			if (socket !== null) {
				return;
			}

			socket = new WebSocket(resolveControlUrl(options));
			socket.addEventListener('message', (event) => handleMessage(event.data));
			socket.addEventListener('close', () => {
				socket = null;
			});
		},
		dispose(): void {
			socket?.close();
			socket = null;
			listeners.clear();
		},
		onOrientation(listener: OrientationListener): () => void {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}
	};
}

function resolveControlUrl(options: ControlStreamClientOptions): string {
	if (options.hostOrigin !== undefined && options.controlOrigin !== undefined) {
		throw new Error('Configure either hostOrigin or controlOrigin, not both.');
	}

	return resolveBrowserSocketUrl({
		path: options.controlPath ?? createControlPath(options.streamId ?? DEFAULT_CONTROL_STREAM_ID),
		label: options.hostOrigin === undefined ? 'controlOrigin' : 'hostOrigin',
		origin: options.hostOrigin ?? options.controlOrigin,
		fallbackHost: window.location.host
	});
}

function createControlPath(streamId: string): string {
	const id = streamId.trim();
	if (id === '' || id.includes('/')) {
		throw new Error('streamId must be a non-empty control stream id without slashes.');
	}

	return `/ws/control/${encodeURIComponent(id)}`;
}

function readControl(data: string): ControlOrientation | null {
	try {
		const parsed: unknown = JSON.parse(data);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('type' in parsed) ||
			parsed.type !== 'control.orientation' ||
			!('payload' in parsed)
		) {
			return null;
		}

		const validation = validateControlOrientation(parsed.payload);
		return validation.ok ? validation.value : null;
	} catch {
		return null;
	}
}
