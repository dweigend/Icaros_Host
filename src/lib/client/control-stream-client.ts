/**
 * Purpose: browser-side public control stream client. It subscribes to
 * normalized controls and does not know about launch registration.
 */
import { type ControlOrientation, validateControlOrientation } from '$lib/protocol';
import { type BrowserSocketOrigin, resolveBrowserSocketUrl } from './browser-socket-url';

export const DEFAULT_CONTROL_STREAM_ID = 'main';

export type OrientationListener = (control: ControlOrientation) => void;

export type ControlStreamClientOptions = Readonly<{
	hostOrigin?: BrowserSocketOrigin;
	controlOrigin?: BrowserSocketOrigin;
	streamId?: string;
	controlPath?: string;
}>;

export class IcarosControlStreamClient {
	#socket: WebSocket | null = null;
	#listeners = new Set<OrientationListener>();

	constructor(readonly options: ControlStreamClientOptions = {}) {}

	start(): void {
		if (this.#socket !== null) {
			return;
		}

		const socket = new WebSocket(resolveControlUrl(this.options));
		this.#socket = socket;
		socket.addEventListener('message', (event) => this.#handleMessage(event.data));
		socket.addEventListener('close', () => {
			this.#socket = null;
		});
	}

	dispose(): void {
		this.#socket?.close();
		this.#socket = null;
		this.#listeners.clear();
	}

	onOrientation(listener: OrientationListener): () => void {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	#handleMessage(data: unknown): void {
		const control = typeof data === 'string' ? readControl(data) : null;
		if (control === null) {
			return;
		}

		for (const listener of this.#listeners) {
			listener(control);
		}
	}
}

export function createIcarosControlStreamClient(
	options: ControlStreamClientOptions = {}
): IcarosControlStreamClient {
	return new IcarosControlStreamClient(options);
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
