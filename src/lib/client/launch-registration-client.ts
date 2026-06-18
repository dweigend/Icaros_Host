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

export type IcarosLaunchRegistrationClient = Readonly<{
	start(): void;
	dispose(): void;
	onStationState(listener: StationStateListener): () => void;
}>;

export function createIcarosLaunchRegistrationClient(
	options: LaunchRegistrationClientOptions
): IcarosLaunchRegistrationClient {
	const resolvedOptions: ResolvedOptions = {
		runtimePath: '/ws/runtime',
		...options,
		clientId: options.clientId ?? readStableClientId(),
		title: options.title ?? readDocumentTitle(options.experienceId)
	};
	let socket: WebSocket | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;
	const stationStateListeners = new Set<StationStateListener>();

	function handleMessage(data: unknown): void {
		if (typeof data !== 'string') {
			return;
		}

		const message = readHostRuntimeMessage(data);
		if (message === null) {
			return;
		}

		switch (message.type) {
			case 'client.registered':
				if (message.payload.clientId === resolvedOptions.clientId) {
					startHeartbeat();
				}
				break;
			case 'client.rejected':
				socket?.close();
				break;
			case 'station.state':
				notifyStationState(message.payload);
				break;
			case 'control.orientation':
				break;
		}
	}

	function notifyStationState(state: StationState): void {
		for (const listener of stationStateListeners) {
			listener(state);
		}
	}

	function sendHello(target: WebSocket): void {
		target.send(
			JSON.stringify(
				createMessage('client.hello', {
					role: 'experience',
					clientId: resolvedOptions.clientId,
					experienceId: resolvedOptions.experienceId,
					title: resolvedOptions.title,
					url: window.location.href,
					userAgent: window.navigator.userAgent
				})
			)
		);
	}

	function startHeartbeat(): void {
		stopHeartbeat();
		heartbeat = setInterval(() => {
			if (socket?.readyState === WebSocket.OPEN) {
				socket.send(
					JSON.stringify(createMessage('client.heartbeat', { clientId: resolvedOptions.clientId }))
				);
			}
		}, 4_000);
	}

	function stopHeartbeat(): void {
		if (heartbeat !== null) {
			clearInterval(heartbeat);
			heartbeat = null;
		}
	}

	return {
		start(): void {
			if (socket !== null) {
				return;
			}

			socket = new WebSocket(resolveRuntimeUrl(resolvedOptions));
			socket.addEventListener('open', () => {
				if (socket !== null) {
					sendHello(socket);
				}
			});
			socket.addEventListener('message', (event) => handleMessage(event.data));
			socket.addEventListener('close', () => {
				stopHeartbeat();
				socket = null;
			});
		},
		dispose(): void {
			stopHeartbeat();
			socket?.close();
			socket = null;
			stationStateListeners.clear();
		},
		onStationState(listener: StationStateListener): () => void {
			stationStateListeners.add(listener);
			return () => stationStateListeners.delete(listener);
		}
	};
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
