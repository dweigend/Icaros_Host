/**
 * Purpose: manage connected runtime WebSocket clients.
 *
 * Runtime clients are browser-side participants: operator pages, Quest launchers,
 * and running experiences. All of them may need station state. Controls are
 * routed to the active experience for interaction and to operators for
 * diagnostics. Keeping those rules in one small registry makes the WebSocket
 * gateway easier to read.
 */
import { WebSocket } from 'ws';
import type {
	ClientRegisterPayload,
	ControlOrientationMessage,
	StationStateMessage
} from '$lib/protocol';

export type RuntimeClient = Readonly<{
	socket: WebSocket;
	registration: ClientRegisterPayload | null;
}>;

export class RuntimeClientRegistry {
	#clients = new Set<RuntimeClient>();

	add(socket: WebSocket): RuntimeClient {
		const client: RuntimeClient = { socket, registration: null };
		this.#clients.add(client);
		return client;
	}

	replaceRegistration(client: RuntimeClient, registration: ClientRegisterPayload): RuntimeClient {
		const registeredClient: RuntimeClient = {
			socket: client.socket,
			registration
		};

		this.#clients.delete(client);
		this.#clients.add(registeredClient);
		return registeredClient;
	}

	remove(client: RuntimeClient): void {
		this.#clients.delete(client);
	}

	closeAll(): void {
		for (const client of this.#clients) {
			client.socket.close();
		}

		this.#clients.clear();
	}

	sendStationState(message: StationStateMessage): void {
		const serialized = JSON.stringify(message);

		for (const client of this.#clients) {
			sendIfOpen(client.socket, serialized);
		}
	}

	sendControlToActiveExperienceAndOperators(
		message: ControlOrientationMessage,
		activeExperienceId: string | null
	): void {
		const serialized = JSON.stringify(message);

		for (const client of this.#clients) {
			if (!canReceiveControl(client, activeExperienceId)) {
				continue;
			}

			sendIfOpen(client.socket, serialized);
		}
	}

	sendControlToClient(
		client: RuntimeClient,
		message: ControlOrientationMessage,
		activeExperienceId: string | null
	): void {
		if (!canReceiveControl(client, activeExperienceId)) {
			return;
		}

		sendIfOpen(client.socket, JSON.stringify(message));
	}
}

function canReceiveControl(client: RuntimeClient, activeExperienceId: string | null): boolean {
	if (client.registration?.role === 'operator') {
		return true;
	}

	return (
		client.registration?.role === 'experience' &&
		client.registration.experienceId === activeExperienceId
	);
}

function sendIfOpen(socket: WebSocket, serializedMessage: string): void {
	if (socket.readyState !== WebSocket.OPEN) {
		return;
	}

	socket.send(serializedMessage);
}
