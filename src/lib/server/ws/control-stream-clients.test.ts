/**
 * Purpose: focused tests for public control stream subscribers before the
 * gateway wires the stream to browser WebSocket clients.
 */
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createControlOrientationMessage } from '$lib/protocol';
import {
	createControlStreamClientRegistry,
	findControlStreamByPath
} from './control-stream-clients';

describe('ControlStreamClientRegistry', () => {
	it('broadcasts normalized controls to subscribers of the matching stream only', () => {
		const registry = createControlStreamClientRegistry();
		const mainSocket = createOpenSocket();
		const otherSocket = createOpenSocket();

		registry.add(mainSocket.socket, 'main');
		registry.add(otherSocket.socket, 'training');
		registry.broadcast('main', createControlMessage());

		expect(readSentTypes(mainSocket)).toEqual(['control.orientation']);
		expect(readSentTypes(otherSocket)).toEqual([]);
	});

	it('removes disconnected subscribers', () => {
		const registry = createControlStreamClientRegistry();
		const socket = createOpenSocket();
		const client = registry.add(socket.socket, 'main');

		expect(registry.count('main')).toBe(1);
		registry.remove(client);
		expect(registry.count('main')).toBe(0);
	});

	it('accepts configured control stream paths and rejects unknown streams', () => {
		expect(findControlStreamByPath('/ws/control/main')).toBe('main');
		expect(findControlStreamByPath('/ws/control/missing')).toBeNull();
		expect(findControlStreamByPath('/ws/control/main/extra')).toBeNull();
		expect(findControlStreamByPath('/ws/runtime')).toBeNull();
	});
});

function createControlMessage(): ReturnType<typeof createControlOrientationMessage> {
	return createControlOrientationMessage({
		pitch: 0.25,
		roll: -0.5,
		quality: 0.8,
		safeMode: false
	});
}

type TestSocket = Readonly<{
	socket: WebSocket;
	sent: string[];
}>;

function createOpenSocket(): TestSocket {
	const sent: string[] = [];
	const socket = {
		readyState: WebSocket.OPEN,
		send: (message: unknown) => {
			sent.push(String(message));
		},
		close: () => {}
	} as unknown as WebSocket;

	return { socket, sent };
}

function readSentTypes(socket: TestSocket): string[] {
	return socket.sent.map((message) => {
		const parsed: unknown = JSON.parse(message);
		if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
			throw new Error('expected sent control stream message to include a type');
		}

		return String(parsed.type);
	});
}
