/**
 * Purpose: tiny browser-side client for student experiences. It hides runtime
 * WebSocket reconnect basics and exposes normalized orientation updates only.
 */
import {
	type ClientRegisteredPayload,
	type ClientRejectedPayload,
	type ControlOrientation,
	createMessage,
	type StationState,
	validateClientRegisteredPayload,
	validateClientRejectedPayload,
	validateControlOrientation,
	validateStationState
} from '$lib/protocol';

export type OrientationListener = (control: ControlOrientation) => void;

type RuntimeOriginOptions =
	| Readonly<{
			/** HTTPS Host origin for standalone clients, converted to WSS at start(). */
			hostOrigin?: string | URL;
			runtimeOrigin?: never;
	  }>
	| Readonly<{
			hostOrigin?: never;
			/** HTTPS or WSS Host runtime origin, converted to WSS at start(). */
			runtimeOrigin?: string | URL;
	  }>
	| Readonly<{
			hostOrigin?: undefined;
			runtimeOrigin?: undefined;
	  }>;

type RuntimeMessage =
	| Readonly<{ type: 'control.orientation'; payload: ControlOrientation }>
	| Readonly<{ type: 'station.state'; payload: StationState }>
	| Readonly<{ type: 'client.registered'; payload: ClientRegisteredPayload }>
	| Readonly<{ type: 'client.rejected'; payload: ClientRejectedPayload }>;

export type ExperienceClientOptions = Readonly<{
	/** Stable experience id sent in the runtime handshake. */
	experienceId: string;
	/** Concrete browser or Quest instance id. Defaults to a stable local id. */
	clientId?: string;
	/** Human-readable title shown in the Host console. */
	title?: string;
	/** Runtime WebSocket path on the Host. Defaults to `/ws/runtime`. */
	runtimePath?: string;
}> &
	RuntimeOriginOptions;

type ResolvedExperienceClientOptions = Readonly<{
	experienceId: string;
	clientId: string;
	title: string;
	runtimePath: string;
	hostOrigin?: string | URL;
	runtimeOrigin?: string | URL;
}>;

export class IcarosExperienceClient {
	#options: ResolvedExperienceClientOptions;
	#socket: WebSocket | null = null;
	#heartbeat: ReturnType<typeof setInterval> | null = null;
	#registered = false;
	#orientationListeners = new Set<OrientationListener>();

	constructor(options: ExperienceClientOptions) {
		this.#options = {
			runtimePath: '/ws/runtime',
			...options,
			clientId: options.clientId ?? readStableClientId(),
			title: options.title ?? readDocumentTitle(options.experienceId)
		};
	}

	start(): void {
		if (this.#socket !== null) {
			return;
		}

		const socket = new WebSocket(resolveRuntimeUrl(this.#options));
		this.#socket = socket;

		socket.addEventListener('open', () => {
			this.#sendHello(socket);
		});

		socket.addEventListener('message', (event) => {
			this.#handleMessage(event.data);
		});

		socket.addEventListener('close', () => {
			this.#stopHeartbeat();
			this.#registered = false;
			this.#socket = null;
		});
	}

	dispose(): void {
		this.#stopHeartbeat();
		this.#registered = false;
		this.#socket?.close();
		this.#socket = null;
		this.#orientationListeners.clear();
	}

	onOrientation(listener: OrientationListener): () => void {
		this.#orientationListeners.add(listener);

		return () => {
			this.#orientationListeners.delete(listener);
		};
	}

	#handleMessage(data: unknown): void {
		if (typeof data !== 'string') {
			return;
		}

		const message = parseRuntimeMessage(data);

		if (message?.type === 'client.registered') {
			if (message.payload.clientId !== this.#options.clientId) {
				return;
			}

			this.#registered = true;
			this.#startHeartbeat();
			return;
		}

		if (message?.type === 'client.rejected') {
			this.#registered = false;
			this.#socket?.close();
			return;
		}

		if (message?.type === 'control.orientation') {
			if (!this.#registered) {
				return;
			}

			for (const listener of this.#orientationListeners) {
				listener(message.payload);
			}
		}

		if (
			message?.type === 'station.state' &&
			message.payload.activeExperienceId !== this.#options.experienceId
		) {
			navigateToHostConsole(this.#options);
		}
	}

	#sendHello(socket: WebSocket): void {
		socket.send(
			JSON.stringify(
				createMessage('client.hello', {
					role: 'experience',
					clientId: this.#options.clientId,
					experienceId: this.#options.experienceId,
					title: this.#options.title,
					url: window.location.href,
					userAgent: window.navigator.userAgent
				})
			)
		);
	}

	#startHeartbeat(): void {
		this.#stopHeartbeat();
		this.#heartbeat = setInterval(() => {
			if (this.#socket?.readyState !== WebSocket.OPEN) {
				return;
			}

			this.#socket.send(
				JSON.stringify(
					createMessage('client.heartbeat', {
						clientId: this.#options.clientId
					})
				)
			);
		}, 4_000);
	}

	#stopHeartbeat(): void {
		if (this.#heartbeat === null) {
			return;
		}

		clearInterval(this.#heartbeat);
		this.#heartbeat = null;
	}
}

/**
 * Creates the public browser client. Standalone clients may pass `hostOrigin`
 * or `runtimeOrigin`; both are resolved to a WSS Host runtime socket.
 */
export function createIcarosExperienceClient(
	options: ExperienceClientOptions
): IcarosExperienceClient {
	return new IcarosExperienceClient(options);
}

function resolveRuntimeUrl(options: ResolvedExperienceClientOptions): string {
	const path = normalizeRuntimePath(options.runtimePath);

	if (options.hostOrigin !== undefined && options.runtimeOrigin !== undefined) {
		throw new Error('Configure either hostOrigin or runtimeOrigin, not both.');
	}

	if (options.hostOrigin !== undefined) {
		const origin = readOrigin('hostOrigin', options.hostOrigin);

		if (origin.protocol !== 'https:') {
			throw new Error('hostOrigin must use https for browser runtime sockets.');
		}

		origin.protocol = 'wss:';
		return new URL(path, origin).toString();
	}

	if (options.runtimeOrigin !== undefined) {
		const origin = readOrigin('runtimeOrigin', options.runtimeOrigin);

		if (origin.protocol === 'http:' || origin.protocol === 'ws:') {
			throw new Error('runtimeOrigin must not use http or ws for browser runtime sockets.');
		}

		if (origin.protocol !== 'https:' && origin.protocol !== 'wss:') {
			throw new Error('runtimeOrigin must use https or wss for browser runtime sockets.');
		}

		origin.protocol = 'wss:';
		return new URL(path, origin).toString();
	}

	return `wss://${window.location.host}${path}`;
}

function normalizeRuntimePath(runtimePath: string): string {
	const path = runtimePath.trim();

	if (path === '' || !path.startsWith('/') || path.startsWith('//')) {
		throw new Error('runtimePath must be an absolute Host path.');
	}

	return path;
}

function readOrigin(label: 'hostOrigin' | 'runtimeOrigin', value: string | URL): URL {
	try {
		const origin = new URL(value.toString());

		if (origin.pathname !== '/' || origin.search !== '' || origin.hash !== '') {
			throw new Error(`${label} must be an origin without path, search, or hash.`);
		}

		return origin;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith(label)) {
			throw error;
		}

		throw new Error(`${label} must be a valid URL origin.`);
	}
}

function readStableClientId(): string {
	const storageKey = 'icaros.clientId';

	try {
		const existing = window.localStorage.getItem(storageKey);
		if (existing !== null && existing.trim() !== '') {
			return existing;
		}

		const clientId = createDefaultClientId();
		window.localStorage.setItem(storageKey, clientId);
		return clientId;
	} catch {
		return createDefaultClientId();
	}
}

function createDefaultClientId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	const bytes = new Uint8Array(16);
	globalThis.crypto?.getRandomValues(bytes);
	return `client-${Date.now().toString(36)}-${Array.from(bytes, formatByte).join('')}`;
}

function formatByte(byte: number): string {
	return byte.toString(16).padStart(2, '0');
}

function navigateToHostConsole(options: ResolvedExperienceClientOptions): void {
	const consoleUrl = resolveHostConsoleUrl(options);

	if (consoleUrl.href === window.location.href) {
		return;
	}

	window.location.assign(consoleUrl.href);
}

function resolveHostConsoleUrl(options: ResolvedExperienceClientOptions): URL {
	const origin = options.hostOrigin ?? options.runtimeOrigin;
	if (origin === undefined) {
		return new URL('/', window.location.href);
	}

	const label = options.hostOrigin === undefined ? 'runtimeOrigin' : 'hostOrigin';
	const url = readOrigin(label, origin);
	url.protocol = 'https:';
	url.pathname = '/';
	return url;
}

function readDocumentTitle(experienceId: string): string {
	const title = document.title.trim();
	return title === '' ? experienceId : title;
}

function parseRuntimeMessage(data: string): RuntimeMessage | null {
	try {
		const parsed: unknown = JSON.parse(data);

		if (!isRuntimeEnvelope(parsed)) {
			return null;
		}

		if (parsed.type === 'client.registered') {
			const validation = validateClientRegisteredPayload(parsed.payload);
			return validation.ok ? { type: 'client.registered', payload: validation.value } : null;
		}

		if (parsed.type === 'client.rejected') {
			const validation = validateClientRejectedPayload(parsed.payload);
			return validation.ok ? { type: 'client.rejected', payload: validation.value } : null;
		}

		if (parsed.type === 'control.orientation') {
			const validation = validateControlOrientation(parsed.payload);
			return validation.ok ? { type: 'control.orientation', payload: validation.value } : null;
		}

		if (parsed.type === 'station.state') {
			const validation = validateStationState(parsed.payload);
			return validation.ok ? { type: 'station.state', payload: validation.value } : null;
		}
	} catch {
		return null;
	}

	return null;
}

function isRuntimeEnvelope(value: unknown): value is Readonly<{ type: string; payload: unknown }> {
	return (
		typeof value === 'object' &&
		value !== null &&
		'type' in value &&
		'payload' in value &&
		typeof value.type === 'string'
	);
}
