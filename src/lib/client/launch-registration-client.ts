/**
 * Purpose: browser-side launch-registration client. It registers one concrete
 * browser instance on `/ws/runtime` and ignores control data.
 */
import { createMessage, readHostRuntimeMessage, type StationState } from '$lib/protocol';
import { type BrowserSocketOrigin, resolveBrowserSocketUrl } from './browser-socket-url';

export type StationStateListener = (state: StationState) => void;

export type LaunchRegistrationClientOptions = Readonly<{
	experienceId: string;
	clientId?: string;
	title?: string;
	hostOrigin?: BrowserSocketOrigin;
	runtimeOrigin?: BrowserSocketOrigin;
	runtimePath?: string;
}>;

type ResolvedOptions = Readonly<{
	experienceId: string;
	clientId: string;
	title: string;
	hostOrigin?: BrowserSocketOrigin;
	runtimeOrigin?: BrowserSocketOrigin;
	runtimePath: string;
}>;

export class IcarosLaunchRegistrationClient {
	#options: ResolvedOptions;
	#socket: WebSocket | null = null;
	#heartbeat: ReturnType<typeof setInterval> | null = null;
	#stationStateListeners = new Set<StationStateListener>();

	constructor(options: LaunchRegistrationClientOptions) {
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
		socket.addEventListener('open', () => this.#sendHello(socket));
		socket.addEventListener('message', (event) => this.#handleMessage(event.data));
		socket.addEventListener('close', () => {
			this.#stopHeartbeat();
			this.#socket = null;
		});
	}

	dispose(): void {
		this.#stopHeartbeat();
		this.#socket?.close();
		this.#socket = null;
		this.#stationStateListeners.clear();
	}

	onStationState(listener: StationStateListener): () => void {
		this.#stationStateListeners.add(listener);
		return () => this.#stationStateListeners.delete(listener);
	}

	#handleMessage(data: unknown): void {
		const message = typeof data === 'string' ? readHostRuntimeMessage(data) : null;
		if (message?.type === 'client.registered') {
			if (message.payload.clientId === this.#options.clientId) {
				this.#startHeartbeat();
			}
			return;
		}

		if (message?.type === 'client.rejected') {
			this.#socket?.close();
			return;
		}

		if (message?.type === 'station.state') {
			for (const listener of this.#stationStateListeners) {
				listener(message.payload);
			}
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
			if (this.#socket?.readyState === WebSocket.OPEN) {
				this.#socket.send(
					JSON.stringify(createMessage('client.heartbeat', { clientId: this.#options.clientId }))
				);
			}
		}, 4_000);
	}

	#stopHeartbeat(): void {
		if (this.#heartbeat !== null) {
			clearInterval(this.#heartbeat);
			this.#heartbeat = null;
		}
	}
}

export function createIcarosLaunchRegistrationClient(
	options: LaunchRegistrationClientOptions
): IcarosLaunchRegistrationClient {
	return new IcarosLaunchRegistrationClient(options);
}

function resolveRuntimeUrl(options: ResolvedOptions): string {
	if (options.hostOrigin !== undefined && options.runtimeOrigin !== undefined) {
		throw new Error('Configure either hostOrigin or runtimeOrigin, not both.');
	}

	return resolveBrowserSocketUrl({
		path: options.runtimePath,
		label: options.hostOrigin === undefined ? 'runtimeOrigin' : 'hostOrigin',
		origin: options.hostOrigin ?? options.runtimeOrigin,
		fallbackHost: window.location.host
	});
}

function readStableClientId(): string {
	try {
		const existing = window.localStorage.getItem('icaros.clientId');
		if (existing !== null && existing.trim() !== '') {
			return existing;
		}

		const clientId = globalThis.crypto.randomUUID();
		window.localStorage.setItem('icaros.clientId', clientId);
		return clientId;
	} catch {
		return globalThis.crypto.randomUUID();
	}
}

function readDocumentTitle(experienceId: string): string {
	const title = document.title.trim();
	return title === '' ? experienceId : title;
}
