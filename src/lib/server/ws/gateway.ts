/**
 * Purpose: WebSocket gateway for the two M1 socket paths.
 *
 * `/ws/device` is only for the M5. It receives raw firmware frames and converts
 * them to normalized controls. `/ws/runtime` is for browser clients. It sends
 * station state to all registered runtime clients and sends controls only to the
 * currently active experience.
 *
 * The gateway owns sockets, timers, and cleanup. It deliberately does not own
 * routing decisions, manifest discovery, or rendering code.
 */
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { type WebSocket, WebSocketServer } from 'ws';
import {
	type ClientRegisterPayload,
	type ControlOrientation,
	createControlOrientationMessage,
	createStationStateMessage,
	validateClientRegisterPayload
} from '$lib/protocol';
import {
	createNeutralControl,
	normalizeM5Frame,
	parseM5Frame,
	STALE_AFTER_MS
} from '$lib/server/control';
import { stationStateStore } from '$lib/server/station/state';
import { RuntimeClientRegistry } from './runtime-clients';

const DEVICE_PATH = '/ws/device';
const RUNTIME_PATH = '/ws/runtime';
const STALE_CHECK_INTERVAL_MS = 250;

type RuntimeHttpServer = HttpServer | HttpsServer;

export class IcarosWebSocketGateway {
	#deviceServer = new WebSocketServer({ noServer: true });
	#runtimeServer = new WebSocketServer({ noServer: true });
	#runtimeClients = new RuntimeClientRegistry();
	#lastControl: ControlOrientation = createNeutralControl();
	#lastDeviceFrameAt: number | null = null;
	#staleTimer: ReturnType<typeof setInterval> | null = null;
	#unsubscribeStation: (() => void) | null = null;

	attach(server: RuntimeHttpServer): void {
		this.#deviceServer.on('connection', (socket) => this.#handleDeviceConnection(socket));
		this.#runtimeServer.on('connection', (socket) => this.#handleRuntimeConnection(socket));
		this.#unsubscribeStation = stationStateStore.subscribe((state) => {
			this.#runtimeClients.sendStationState(createStationStateMessage(state));
		});
		this.#staleTimer = setInterval(
			() => this.#publishStaleControlIfNeeded(),
			STALE_CHECK_INTERVAL_MS
		);

		server.on('upgrade', (request, socket, head) => {
			this.#handleUpgrade(request, socket, head);
		});
	}

	dispose(): void {
		this.#unsubscribeStation?.();
		if (this.#staleTimer !== null) {
			clearInterval(this.#staleTimer);
			this.#staleTimer = null;
		}
		this.#deviceServer.close();
		this.#runtimeServer.close();
		this.#runtimeClients.closeAll();
	}

	#handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
		const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

		if (pathname === DEVICE_PATH) {
			this.#deviceServer.handleUpgrade(request, socket, head, (websocket) => {
				this.#deviceServer.emit('connection', websocket, request);
			});
			return;
		}

		if (pathname === RUNTIME_PATH) {
			this.#runtimeServer.handleUpgrade(request, socket, head, (websocket) => {
				this.#runtimeServer.emit('connection', websocket, request);
			});
			return;
		}

		socket.destroy();
	}

	#handleDeviceConnection(socket: WebSocket): void {
		socket.on('message', (data) => {
			const frame = parseM5Frame(data.toString());

			if (frame === null) {
				this.#publishControl(createNeutralControl());
				return;
			}

			this.#lastDeviceFrameAt = Date.now();
			this.#publishControl(normalizeM5Frame(frame));
		});

		socket.on('close', () => {
			this.#lastDeviceFrameAt = null;
			this.#publishControl(createNeutralControl());
		});
	}

	#handleRuntimeConnection(socket: WebSocket): void {
		let client = this.#runtimeClients.add(socket);

		socket.send(JSON.stringify(createStationStateMessage(stationStateStore.getState())));
		this.#runtimeClients.sendControlToClient(
			client,
			createControlOrientationMessage(this.#lastControl),
			stationStateStore.getState().activeExperienceId
		);

		socket.on('message', (data) => {
			const registration = readRegistration(data.toString());

			if (registration === null) {
				return;
			}

			client = this.#runtimeClients.replaceRegistration(client, registration);
		});

		socket.on('close', () => {
			this.#runtimeClients.remove(client);
		});
	}

	#publishControl(control: ControlOrientation): void {
		this.#lastControl = control;
		this.#runtimeClients.sendControlToActiveExperience(
			createControlOrientationMessage(control),
			stationStateStore.getState().activeExperienceId
		);
	}

	#publishStaleControlIfNeeded(): void {
		if (this.#lastDeviceFrameAt === null) {
			return;
		}

		if (Date.now() - this.#lastDeviceFrameAt <= STALE_AFTER_MS) {
			return;
		}

		this.#lastDeviceFrameAt = null;
		this.#publishControl(createNeutralControl());
	}
}

export function createIcarosWebSocketGateway(): IcarosWebSocketGateway {
	return new IcarosWebSocketGateway();
}

function readRegistration(input: string): ClientRegisterPayload | null {
	try {
		const parsed: unknown = JSON.parse(input);

		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('type' in parsed) ||
			parsed.type !== 'client.register' ||
			!('payload' in parsed)
		) {
			return null;
		}

		const validation = validateClientRegisterPayload(parsed.payload);
		return validation.ok ? validation.value : null;
	} catch {
		return null;
	}
}
