/**
 * Purpose: manage public normalized-control WebSocket subscribers by stream id.
 * This registry does not know about runtime registration or launch selection.
 */
import { WebSocket } from 'ws';
import type { ControlOrientationMessage } from '$lib/protocol';
import { findControlStream } from '$lib/server/control';

type ControlStreamClient = Readonly<{
	socket: WebSocket;
	streamId: string;
}>;

export type ControlStreamClientRegistry = Readonly<{
	add(socket: WebSocket, streamId: string): ControlStreamClient;
	remove(client: ControlStreamClient): void;
	closeAll(): void;
	broadcast(streamId: string, message: ControlOrientationMessage): void;
	count(streamId: string): number;
}>;

export function createControlStreamClientRegistry(): ControlStreamClientRegistry {
	const clients = new Set<ControlStreamClient>();

	function add(socket: WebSocket, streamId: string): ControlStreamClient {
		const client = { socket, streamId };
		clients.add(client);
		return client;
	}

	function remove(client: ControlStreamClient): void {
		clients.delete(client);
	}

	function closeAll(): void {
		for (const client of clients) {
			client.socket.close();
		}

		clients.clear();
	}

	function broadcast(streamId: string, message: ControlOrientationMessage): void {
		const serialized = JSON.stringify(message);

		for (const client of clients) {
			if (client.streamId !== streamId) {
				continue;
			}

			sendIfOpen(client.socket, serialized);
		}
	}

	function count(streamId: string): number {
		let count = 0;
		for (const client of clients) {
			if (client.streamId === streamId) {
				count += 1;
			}
		}

		return count;
	}

	return { add, remove, closeAll, broadcast, count };
}

export function findControlStreamByPath(pathname: string): string | null {
	const match = /^\/ws\/control\/([^/]+)$/.exec(pathname);
	if (match === null) {
		return null;
	}

	const streamId = decodeStreamId(match[1] ?? '');
	if (streamId === null) {
		return null;
	}

	return findControlStream(streamId) === null ? null : streamId;
}

function decodeStreamId(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function sendIfOpen(socket: WebSocket, serializedMessage: string): void {
	if (socket.readyState !== WebSocket.OPEN) {
		return;
	}

	socket.send(serializedMessage);
}
