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

type RuntimeMessage =
	| Readonly<{ type: 'control.orientation'; payload: ControlOrientation }>
	| Readonly<{ type: 'station.state'; payload: StationState }>
	| Readonly<{ type: 'client.registered'; payload: ClientRegisteredPayload }>
	| Readonly<{ type: 'client.rejected'; payload: ClientRejectedPayload }>;

export type ExperienceClientOptions = Readonly<{
	experienceId: string;
	clientId?: string;
	title?: string;
	runtimePath?: string;
}>;

export class IcarosExperienceClient {
	#options: Required<ExperienceClientOptions>;
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

		const socket = new WebSocket(resolveRuntimeUrl(this.#options.runtimePath));
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
			navigateToHostConsole();
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

export function createIcarosExperienceClient(
	options: ExperienceClientOptions
): IcarosExperienceClient {
	return new IcarosExperienceClient(options);
}

function resolveRuntimeUrl(runtimePath: string): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${protocol}//${window.location.host}${runtimePath}`;
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

function navigateToHostConsole(): void {
	const consoleUrl = new URL('/', window.location.href);

	if (consoleUrl.href === window.location.href) {
		return;
	}

	window.location.assign(consoleUrl.href);
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
