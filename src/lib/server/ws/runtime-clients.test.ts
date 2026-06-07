/**
 * Purpose: focused tests for runtime WebSocket routing so normalized controls
 * reach diagnostic operator clients without loosening active experience routing.
 */
import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createControlOrientationMessage } from '$lib/protocol';
import { createIcarosWebSocketGateway } from './gateway';
import { RuntimeClientRegistry } from './runtime-clients';

describe('RuntimeClientRegistry', () => {
	it('sends normalized controls to operators even without an active experience', () => {
		const registry = new RuntimeClientRegistry();
		const operatorSocket = createOpenSocket();
		const operator = registry.add(operatorSocket.socket);
		registry.replaceRegistration(operator, { role: 'operator', id: 'host-console-debug' });

		registry.sendControlToActiveClientAndOperators(createControlMessage(), null);

		expect(readSentTypes(operatorSocket)).toEqual(['control.orientation']);
	});

	it('keeps diagnostic operators out of selectable runtime clients', () => {
		const registry = new RuntimeClientRegistry();
		const operatorSocket = createOpenSocket();
		const operator = registry.add(operatorSocket.socket);
		registry.replaceRegistration(operator, { role: 'operator', id: 'host-console-debug' });

		expect(registry.listRuntimeClients()).toEqual([]);
		expect(registry.findSelectableClient('host-console-debug')).toBeNull();
	});

	it('keeps experience controls limited to the active experience', () => {
		const registry = new RuntimeClientRegistry();
		const activeSocket = createOpenSocket();
		const inactiveSocket = createOpenSocket();
		const active = registry.add(activeSocket.socket);
		const inactive = registry.add(inactiveSocket.socket);
		registry.registerHello(
			active,
			{
				role: 'experience',
				clientId: 'active-client',
				experienceId: 'echo-flight',
				title: 'Echo Flight',
				url: 'https://client.local/active'
			},
			100
		);
		registry.registerHello(
			inactive,
			{
				role: 'experience',
				clientId: 'inactive-client',
				experienceId: 'echo-flight',
				title: 'Echo Flight',
				url: 'https://client.local/inactive'
			},
			100
		);

		registry.sendControlToActiveClientAndOperators(createControlMessage(), 'active-client');

		expect(readSentTypes(activeSocket)).toEqual(['control.orientation']);
		expect(readSentTypes(inactiveSocket)).toEqual([]);
	});

	it('sends the current control to a newly registered operator client', () => {
		const registry = new RuntimeClientRegistry();
		const operatorSocket = createOpenSocket();
		const unregistered = registry.add(operatorSocket.socket);
		const operator = registry.replaceRegistration(unregistered, {
			role: 'operator',
			id: 'host-console-debug'
		});

		registry.sendControlToClient(operator, createControlMessage(), null);

		expect(readSentTypes(operatorSocket)).toEqual(['control.orientation']);
	});

	it('lists concrete runtime clients and marks stale heartbeats', () => {
		const registry = new RuntimeClientRegistry();
		const socket = createOpenSocket();
		const client = registry.add(socket.socket);
		registry.registerHello(
			client,
			{
				role: 'experience',
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local/'
			},
			1_000
		);

		expect(registry.listRuntimeClients()).toEqual([
			{
				clientId: 'quest-client',
				experienceId: 'mountain-flight',
				title: 'Mountain Flight',
				url: 'https://quest.local/',
				connectedAt: 1_000,
				lastSeenAt: 1_000,
				status: 'online'
			}
		]);

		expect(registry.markStaleClients(10_000, 8_000)).toBe(true);
		expect(registry.findSelectableClient('quest-client')).toBeNull();
	});

	it('keeps a reconnected client selectable when the old socket closes late', () => {
		const registry = new RuntimeClientRegistry();
		const firstSocket = createOpenSocket();
		const secondSocket = createOpenSocket();
		const firstConnection = registry.add(firstSocket.socket);
		const firstClient = registry.registerHello(firstConnection, createHelloPayload(), 1_000);
		const secondConnection = registry.add(secondSocket.socket);

		registry.registerHello(secondConnection, createHelloPayload(), 2_000);

		expect(registry.remove(firstClient)).toBeNull();
		expect(registry.findSelectableClient('quest-client')).toMatchObject({
			clientId: 'quest-client',
			connectedAt: 2_000
		});
	});

	it('accepts clearly named operator diagnostic runtime registrations', async () => {
		const gateway = await createTestGateway();

		try {
			const messageType = await sendRuntimeMessageAndReadType(gateway.runtimeUrl, {
				type: 'operator.diagnostic.register',
				payload: { id: 'host-console-debug' }
			});

			expect(messageType).toBe('control.orientation');
		} finally {
			await gateway.dispose();
		}
	});
});

function createControlMessage(): ReturnType<typeof createControlOrientationMessage> {
	return createControlOrientationMessage({
		pitch: 0.25,
		roll: -0.5,
		quality: 0.8,
		source: 'm5',
		safeMode: false,
		timestamp: 123
	});
}

function createHelloPayload() {
	return {
		role: 'experience' as const,
		clientId: 'quest-client',
		experienceId: 'mountain-flight',
		title: 'Mountain Flight',
		url: 'https://quest.local/'
	};
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
			throw new Error('expected sent runtime message to include a type');
		}

		return String(parsed.type);
	});
}

type TestGateway = Readonly<{
	runtimeUrl: string;
	dispose: () => Promise<void>;
}>;

type RuntimeSocketMessage = Readonly<{
	type: string;
	payload: unknown;
}>;

async function createTestGateway(): Promise<TestGateway> {
	const server = createServer();
	const gateway = createIcarosWebSocketGateway();
	gateway.attach(server);

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});

	return {
		runtimeUrl: readRuntimeUrl(server),
		dispose: async () => {
			gateway.dispose();
			await closeServer(server);
		}
	};
}

function readRuntimeUrl(server: Server): string {
	const address = server.address();
	if (typeof address !== 'object' || address === null) {
		throw new Error('expected test server to listen on a TCP port');
	}

	return `ws://127.0.0.1:${address.port}/ws/runtime`;
}

function sendRuntimeMessageAndReadType(
	runtimeUrl: string,
	message: RuntimeSocketMessage
): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(runtimeUrl);
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error(`timed out waiting for ${message.type} response`));
		}, 1_000);

		socket.on('open', () => {
			socket.send(JSON.stringify(message));
		});

		socket.on('message', (data) => {
			const parsedType = readRuntimeMessageType(data.toString());
			if (
				parsedType === null ||
				parsedType === 'station.state' ||
				parsedType === 'runtime.clients'
			) {
				return;
			}

			clearTimeout(timeout);
			socket.close();
			resolve(parsedType);
		});

		socket.on('error', (error) => {
			clearTimeout(timeout);
			socket.close();
			reject(error);
		});
	});
}

function readRuntimeMessageType(input: string): string | null {
	try {
		const parsed: unknown = JSON.parse(input);
		if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
			return null;
		}

		return typeof parsed.type === 'string' ? parsed.type : null;
	} catch {
		return null;
	}
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) => {
		server.close((error) => {
			if (error === undefined) {
				resolve();
				return;
			}

			reject(error);
		});
	});
}
