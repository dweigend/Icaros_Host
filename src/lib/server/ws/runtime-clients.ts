/**
 * Purpose: manage connected runtime WebSocket clients.
 *
 * Runtime clients are browser-side participants: operator pages, Quest launchers,
 * and running experiences. All of them may need station state, but only the
 * currently active experience should receive control frames. Keeping that rule in
 * one small registry makes the WebSocket gateway easier to read.
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

	sendControlToActiveExperience(
		message: ControlOrientationMessage,
		activeExperienceId: string | null
	): void {
		const serialized = JSON.stringify(message);

		for (const client of this.#clients) {
			if (!isActiveExperienceClient(client, activeExperienceId)) {
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
		if (!isActiveExperienceClient(client, activeExperienceId)) {
			return;
		}

		sendIfOpen(client.socket, JSON.stringify(message));
	}
}

function isActiveExperienceClient(
	client: RuntimeClient,
	activeExperienceId: string | null
): boolean {
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
