/**
 * Purpose: WebSocket gateway for the two M1 socket paths.
 *
 * `/ws/device` is only for the M5. It receives raw firmware frames and converts
 * them to normalized controls. `/ws/runtime` is for browser clients. It sends
 * station state to all registered runtime clients, sends controls to the
 * currently active experience, and mirrors normalized controls to operator
 * clients for diagnostics.
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
	isM5OrientationFrame,
	normalizeM5Frame,
	parseM5Frame,
	STALE_AFTER_MS,
	smoothControlOrientation
} from '$lib/server/control';
import {
	createDevicePairingTokenFingerprint,
	isDevicePairingRequest,
	readDevicePairingTokenFingerprint
} from '$lib/server/device/pairing';
import {
	recordDeviceSocketUpgrade,
	recordPairedDeviceFrame,
	recordPairedDeviceSocketOpen,
	recordRejectedDeviceSocket
} from '$lib/server/device/usb-setup';
import { stationStateStore } from '$lib/server/station/state';
import { RuntimeClientRegistry } from './runtime-clients';

const DEVICE_PATH = '/ws/device';
const RUNTIME_PATH = '/ws/runtime';
const STALE_CHECK_INTERVAL_MS = 250;

type RuntimeHttpServer = HttpServer | HttpsServer;
type GatewayUpgradeMode = 'all' | 'device-only';

export class IcarosWebSocketGateway {
	#deviceServer = new WebSocketServer({ noServer: true });
	#runtimeServer = new WebSocketServer({ noServer: true });
	#runtimeClients = new RuntimeClientRegistry();
	#lastControl: ControlOrientation = createNeutralControl();
	#lastDeviceFrameAt: number | null = null;
	#staleTimer: ReturnType<typeof setInterval> | null = null;
	#unsubscribeStation: (() => void) | null = null;
	#handlersRegistered = false;

	attach(server: RuntimeHttpServer): void {
		this.#attach(server, 'all');
	}

	attachDeviceServer(server: RuntimeHttpServer): void {
		this.#attach(server, 'device-only');
	}

	#attach(server: RuntimeHttpServer, mode: GatewayUpgradeMode): void {
		this.#registerHandlers();

		server.on('upgrade', (request, socket, head) => {
			this.#handleUpgrade(request, socket, head, mode);
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

	#registerHandlers(): void {
		if (this.#handlersRegistered) {
			return;
		}

		this.#handlersRegistered = true;
		this.#deviceServer.on('connection', (socket, request) =>
			this.#handleDeviceConnection(socket, request)
		);
		this.#runtimeServer.on('connection', (socket) => this.#handleRuntimeConnection(socket));
		this.#unsubscribeStation = stationStateStore.subscribe((state) => {
			this.#runtimeClients.sendStationState(createStationStateMessage(state));
		});
		this.#staleTimer = setInterval(
			() => this.#publishStaleControlIfNeeded(),
			STALE_CHECK_INTERVAL_MS
		);
	}

	#handleUpgrade(
		request: IncomingMessage,
		socket: Duplex,
		head: Buffer,
		mode: GatewayUpgradeMode
	): void {
		const url = new URL(request.url ?? '/', 'http://localhost');
		const pathname = url.pathname;

		if (pathname === DEVICE_PATH) {
			const pairing = url.searchParams.get('pairing');
			if (!isDevicePairingRequest(pairing)) {
				recordDeviceSocketUpgrade(
					createDeviceUpgradeDiagnostics(request, url, 'reject', 'invalid pairing token')
				);
				recordRejectedDeviceSocket('invalid pairing token');
				socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
				socket.destroy();
				return;
			}

			recordDeviceSocketUpgrade(
				createDeviceUpgradeDiagnostics(request, url, 'handleUpgrade', null)
			);
			this.#deviceServer.handleUpgrade(request, socket, head, (websocket) => {
				recordDeviceSocketUpgrade(createDeviceUpgradeDiagnostics(request, url, 'accepted', null));
				this.#deviceServer.emit('connection', websocket, request);
			});
			return;
		}

		if (mode === 'all' && pathname === RUNTIME_PATH) {
			this.#runtimeServer.handleUpgrade(request, socket, head, (websocket) => {
				this.#runtimeServer.emit('connection', websocket, request);
			});
			return;
		}

		recordDeviceSocketUpgrade(
			createDeviceUpgradeDiagnostics(request, url, 'non-device-path', 'unsupported websocket path')
		);
		socket.destroy();
	}

	#handleDeviceConnection(socket: WebSocket, request: IncomingMessage): void {
		recordPairedDeviceSocketOpen(formatRemoteAddress(request));

		socket.on('message', (data) => {
			const frame = parseM5Frame(data.toString());

			if (frame === null) {
				this.#publishControl(createNeutralControl());
				return;
			}

			recordPairedDeviceFrame(frame);

			if (!isM5OrientationFrame(frame)) {
				return;
			}

			this.#lastDeviceFrameAt = Date.now();
			this.#publishControl(smoothControlOrientation(this.#lastControl, normalizeM5Frame(frame)));
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
			this.#runtimeClients.sendControlToClient(
				client,
				createControlOrientationMessage(this.#lastControl),
				stationStateStore.getState().activeExperienceId
			);
		});

		socket.on('close', () => {
			this.#runtimeClients.remove(client);
		});
	}

	#publishControl(control: ControlOrientation): void {
		this.#lastControl = control;
		this.#runtimeClients.sendControlToActiveExperienceAndOperators(
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

function formatRemoteAddress(request: IncomingMessage): string | null {
	const address = request.socket.remoteAddress;
	if (address === undefined) {
		return null;
	}

	const port = request.socket.remotePort;
	return port === undefined ? address : `${address}:${port}`;
}

function createDeviceUpgradeDiagnostics(
	request: IncomingMessage,
	url: URL,
	decision: 'reject' | 'handleUpgrade' | 'accepted' | 'non-device-path',
	reason: string | null
): Parameters<typeof recordDeviceSocketUpgrade>[0] {
	const pairing = url.searchParams.get('pairing');

	return {
		remote: formatRemoteAddress(request),
		path: url.pathname,
		hasPairing: pairing !== null && pairing !== '',
		pairingFingerprint: createDevicePairingTokenFingerprint(pairing),
		expectedFingerprint: readDevicePairingTokenFingerprint(),
		protocol: readHeader(request, 'sec-websocket-protocol'),
		origin: readHeader(request, 'origin'),
		decision,
		reason
	};
}

function readHeader(request: IncomingMessage, name: string): string | null {
	const value = request.headers[name];
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed === '' ? null : trimmed;
	}

	if (Array.isArray(value)) {
		return value.join(', ');
	}

	return null;
}
