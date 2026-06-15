/**
 * Purpose: integration tests for the public normalized control stream gateway.
 * These tests keep `/ws/device` private while proving `/ws/control/main` is a
 * public subscriber stream.
 */
import { createServer, type Server } from 'node:http';
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { readDevicePairingToken } from '$lib/server/device/pairing';
import { createIcarosWebSocketGateway } from './gateway';

describe('IcarosWebSocketGateway control streams', () => {
	it('accepts /ws/control/main and broadcasts normalized device controls', async () => {
		const gateway = await createTestGateway();
		const controlSocket = new WebSocket(gateway.controlUrl);
		const messages = collectJsonMessages(controlSocket);

		try {
			const initial = await messages.next();
			expect(initial).toMatchObject({
				type: 'control.orientation',
				payload: {
					pitch: 0,
					roll: 0,
					quality: 0,
					safeMode: true
				}
			});

			await sendDeviceFrame(gateway.deviceUrl, { pitch: 45, roll: -45, quality: 0.75 });

			const update = await messages.next();
			expect(update).toMatchObject({
				type: 'control.orientation',
				payload: {
					pitch: 1,
					roll: -1,
					quality: 0.75,
					safeMode: false
				}
			});
		} finally {
			controlSocket.close();
			await gateway.dispose();
		}
	});

	it('rejects unknown control stream ids', async () => {
		const gateway = await createTestGateway();
		const socket = new WebSocket(gateway.unknownControlUrl);

		try {
			const error = await readSocketError(socket);
			expect(error.message).toBe('Unexpected server response: 404');
		} finally {
			socket.close();
			await gateway.dispose();
		}
	});
});

type TestGateway = Readonly<{
	controlUrl: string;
	deviceUrl: string;
	unknownControlUrl: string;
	dispose: () => Promise<void>;
}>;

async function createTestGateway(): Promise<TestGateway> {
	const server = createServer();
	const gateway = createIcarosWebSocketGateway();
	gateway.attach(server);

	await new Promise<void>((resolve) => {
		server.listen(0, '127.0.0.1', resolve);
	});

	const baseUrl = readBaseUrl(server);
	const deviceUrl = new URL('/ws/device', baseUrl);
	deviceUrl.searchParams.set('pairing', readDevicePairingToken());

	return {
		controlUrl: new URL('/ws/control/main', baseUrl).toString(),
		deviceUrl: deviceUrl.toString(),
		unknownControlUrl: new URL('/ws/control/missing', baseUrl).toString(),
		dispose: async () => {
			gateway.dispose();
			await closeServer(server);
		}
	};
}

function readBaseUrl(server: Server): string {
	const address = server.address();
	if (typeof address !== 'object' || address === null) {
		throw new Error('expected test server to listen on a TCP port');
	}

	return `ws://127.0.0.1:${address.port}`;
}

function collectJsonMessages(socket: WebSocket): Readonly<{ next: () => Promise<unknown> }> {
	const messages: unknown[] = [];
	const waiters: Array<(message: unknown) => void> = [];

	socket.on('message', (data) => {
		const message: unknown = JSON.parse(data.toString());
		const waiter = waiters.shift();
		if (waiter === undefined) {
			messages.push(message);
			return;
		}

		waiter(message);
	});

	return {
		next: () => {
			const message = messages.shift();
			if (message !== undefined) {
				return Promise.resolve(message);
			}

			return new Promise((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('timed out waiting for control stream message'));
				}, 1_000);
				waiters.push((nextMessage) => {
					clearTimeout(timeout);
					resolve(nextMessage);
				});
			});
		}
	};
}

function sendDeviceFrame(deviceUrl: string, frame: unknown): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(deviceUrl);
		const timeout = setTimeout(() => {
			socket.close();
			reject(new Error('timed out waiting for device socket open'));
		}, 1_000);

		socket.on('open', () => {
			clearTimeout(timeout);
			socket.send(JSON.stringify(frame));
			socket.close();
			resolve();
		});
		socket.on('error', (error) => {
			clearTimeout(timeout);
			reject(error);
		});
	});
}

function readSocketError(socket: WebSocket): Promise<Error> {
	return new Promise((resolve) => {
		socket.on('error', (error) => {
			resolve(error);
		});
	});
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
