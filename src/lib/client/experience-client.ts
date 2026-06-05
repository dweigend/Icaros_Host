/**
 * Purpose: tiny browser-side client for student experiences. It hides runtime
 * WebSocket reconnect basics and exposes normalized orientation updates only.
 */
import {
	type ControlOrientation,
	type ControlOrientationMessage,
	createMessage,
	type StationStateMessage,
	validateControlOrientation,
	validateStationState
} from '$lib/protocol';

export type OrientationListener = (control: ControlOrientation) => void;

export type ExperienceClientOptions = Readonly<{
	experienceId: string;
	clientId?: string;
	runtimePath?: string;
}>;

export class IcarosExperienceClient {
	#options: Required<ExperienceClientOptions>;
	#socket: WebSocket | null = null;
	#orientationListeners = new Set<OrientationListener>();

	constructor(options: ExperienceClientOptions) {
		this.#options = {
			clientId: crypto.randomUUID(),
			runtimePath: '/ws/runtime',
			...options
		};
	}

	start(): void {
		if (this.#socket !== null) {
			return;
		}

		const socket = new WebSocket(resolveRuntimeUrl(this.#options.runtimePath));
		this.#socket = socket;

		socket.addEventListener('open', () => {
			socket.send(
				JSON.stringify(
					createMessage('client.register', {
						role: 'experience',
						id: this.#options.clientId,
						experienceId: this.#options.experienceId
					})
				)
			);
		});

		socket.addEventListener('message', (event) => {
			this.#handleMessage(event.data);
		});

		socket.addEventListener('close', () => {
			this.#socket = null;
		});
	}

	dispose(): void {
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

		if (message?.type === 'control.orientation') {
			for (const listener of this.#orientationListeners) {
				listener(message.payload);
			}
		}

		if (
			message?.type === 'station.state' &&
			message.payload.activeExperienceId !== this.#options.experienceId
		) {
			window.location.assign('/');
		}
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

function parseRuntimeMessage(data: string): ControlOrientationMessage | StationStateMessage | null {
	try {
		const parsed: unknown = JSON.parse(data);

		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'type' in parsed &&
			'payload' in parsed &&
			parsed.type === 'control.orientation'
		) {
			const validation = validateControlOrientation(parsed.payload);
			return validation.ok
				? ({ ...parsed, payload: validation.value } as ControlOrientationMessage)
				: null;
		}

		if (
			typeof parsed === 'object' &&
			parsed !== null &&
			'type' in parsed &&
			'payload' in parsed &&
			parsed.type === 'station.state'
		) {
			const validation = validateStationState(parsed.payload);
			return validation.ok
				? ({ ...parsed, payload: validation.value } as StationStateMessage)
				: null;
		}
	} catch {
		return null;
	}

	return null;
}
