/**
 * Purpose: manage browser runtime WebSocket clients for the local station.
 * The registry owns concrete client presence and routing decisions, but leaves
 * station state, device normalization, and rendering outside this boundary.
 */
import { WebSocket } from 'ws';
import type {
	ClientHelloPayload,
	RuntimeClientSummary,
	RuntimeClientsMessage,
	StationStateMessage
} from '$lib/protocol';

const RUNTIME_CLIENT_REGISTRY_KEY = '__icarosRuntimeClientRegistry';

type IcarosGlobalRuntime = typeof globalThis & {
	[RUNTIME_CLIENT_REGISTRY_KEY]?: RuntimeClientRegistry;
};

export type RuntimeClient = Readonly<{
	socket: WebSocket;
	registration: RuntimeClientRegistration | null;
	presence: RuntimeClientSummary | null;
}>;

type RuntimeClientRegistration = Readonly<{
	role: 'experience';
	id: string;
	experienceId: string;
}>;

export class RuntimeClientRegistry {
	#clients = new Set<RuntimeClient>();

	add(socket: WebSocket): RuntimeClient {
		const client: RuntimeClient = { socket, registration: null, presence: null };
		this.#clients.add(client);
		return client;
	}

	registerHello(client: RuntimeClient, payload: ClientHelloPayload, now: number): RuntimeClient {
		this.#closeDuplicateClient(payload.clientId, client);

		return this.#replace(client, {
			registration: {
				role: 'experience',
				id: payload.clientId,
				experienceId: payload.experienceId
			},
			presence: {
				clientId: payload.clientId,
				experienceId: payload.experienceId,
				title: payload.title,
				url: payload.url,
				...(payload.userAgent === undefined ? {} : { userAgent: payload.userAgent }),
				connectedAt: now,
				lastSeenAt: now,
				status: 'online'
			}
		});
	}

	recordHeartbeat(clientId: string, now: number): boolean {
		const client = this.#findByClientId(clientId);
		if (client?.presence === null || client === null) {
			return false;
		}

		const statusChanged = client.presence.status !== 'online';
		this.#replace(client, {
			registration: client.registration,
			presence: { ...client.presence, lastSeenAt: now, status: 'online' }
		});
		return statusChanged;
	}

	markStaleClients(now: number, staleAfterMs: number): boolean {
		let changed = false;

		for (const client of Array.from(this.#clients)) {
			const presence = client.presence;
			if (presence === null || presence.status === 'stale') {
				continue;
			}

			if (now - presence.lastSeenAt <= staleAfterMs) {
				continue;
			}

			this.#replace(client, {
				registration: client.registration,
				presence: { ...presence, status: 'stale' }
			});
			changed = true;
		}

		return changed;
	}

	remove(client: RuntimeClient): RuntimeClientSummary | null {
		return this.#clients.delete(client) ? client.presence : null;
	}

	closeAll(): void {
		for (const client of this.#clients) {
			client.socket.close();
		}

		this.#clients.clear();
	}

	findSelectableClient(clientId: string): RuntimeClientSummary | null {
		const presence = this.#findByClientId(clientId)?.presence;
		if (presence === undefined || presence === null || presence.status !== 'online') {
			return null;
		}

		return presence;
	}

	listRuntimeClients(): readonly RuntimeClientSummary[] {
		return Array.from(this.#clients)
			.map((client) => client.presence)
			.filter((presence): presence is RuntimeClientSummary => presence !== null)
			.sort(compareRuntimeClients);
	}

	sendStationState(message: StationStateMessage): void {
		this.#sendToAll(JSON.stringify(message));
	}

	sendRuntimeClients(message: RuntimeClientsMessage): void {
		this.#sendToAll(JSON.stringify(message));
	}

	#replace(
		client: RuntimeClient,
		next: Pick<RuntimeClient, 'registration' | 'presence'>
	): RuntimeClient {
		const updatedClient: RuntimeClient = {
			socket: client.socket,
			registration: next.registration,
			presence: next.presence
		};

		this.#clients.delete(client);
		this.#clients.add(updatedClient);
		return updatedClient;
	}

	#closeDuplicateClient(clientId: string, currentClient: RuntimeClient): void {
		const duplicate = this.#findByClientId(clientId);
		if (duplicate === null || duplicate === currentClient) {
			return;
		}

		this.#clients.delete(duplicate);
		duplicate.socket.close();
	}

	#findByClientId(clientId: string): RuntimeClient | null {
		for (const client of this.#clients) {
			if (client.presence?.clientId === clientId) {
				return client;
			}
		}

		return null;
	}

	#sendToAll(serializedMessage: string): void {
		for (const client of this.#clients) {
			sendIfOpen(client.socket, serializedMessage);
		}
	}
}

export const runtimeClientRegistry =
	(globalThis as IcarosGlobalRuntime)[RUNTIME_CLIENT_REGISTRY_KEY] ?? new RuntimeClientRegistry();

(globalThis as IcarosGlobalRuntime)[RUNTIME_CLIENT_REGISTRY_KEY] = runtimeClientRegistry;

function compareRuntimeClients(a: RuntimeClientSummary, b: RuntimeClientSummary): number {
	if (a.status !== b.status) {
		return a.status === 'online' ? -1 : 1;
	}

	return b.lastSeenAt - a.lastSeenAt;
}

function sendIfOpen(socket: WebSocket, serializedMessage: string): void {
	if (socket.readyState !== WebSocket.OPEN) {
		return;
	}

	socket.send(serializedMessage);
}
