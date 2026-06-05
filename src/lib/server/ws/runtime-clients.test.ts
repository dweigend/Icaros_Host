/**
 * Purpose: focused tests for runtime WebSocket routing so normalized controls
 * reach diagnostic operator clients without loosening active experience routing.
 */
import { describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';

import { createControlOrientationMessage } from '$lib/protocol';
import { RuntimeClientRegistry } from './runtime-clients';

describe('RuntimeClientRegistry', () => {
	it('sends normalized controls to operators even without an active experience', () => {
		const registry = new RuntimeClientRegistry();
		const operatorSocket = createOpenSocket();
		const operator = registry.add(operatorSocket.socket);
		registry.replaceRegistration(operator, { role: 'operator', id: 'host-console-debug' });

		registry.sendControlToActiveExperienceAndOperators(createControlMessage(), null);

		expect(readSentTypes(operatorSocket)).toEqual(['control.orientation']);
	});

	it('keeps experience controls limited to the active experience', () => {
		const registry = new RuntimeClientRegistry();
		const activeSocket = createOpenSocket();
		const inactiveSocket = createOpenSocket();
		const active = registry.add(activeSocket.socket);
		const inactive = registry.add(inactiveSocket.socket);
		registry.replaceRegistration(active, {
			role: 'experience',
			id: 'active-client',
			experienceId: 'echo-flight'
		});
		registry.replaceRegistration(inactive, {
			role: 'experience',
			id: 'inactive-client',
			experienceId: 'other-flight'
		});

		registry.sendControlToActiveExperienceAndOperators(createControlMessage(), 'echo-flight');

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
