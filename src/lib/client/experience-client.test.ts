/**
 * Purpose: focused browser-client tests for Host runtime URL resolution. The
 * file keeps transport setup local to the public client and does not exercise
 * server routing or device behavior.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIcarosExperienceClient } from './experience-client';

const EXPERIENCE_ID = 'mountain-flight';
const CLIENT_ID = 'quest-client';
const TITLE = 'Mountain Flight';

const createdRuntimeUrls: string[] = [];

class RuntimeUrlWebSocket {
	static readonly OPEN = 1;

	readonly readyState = 0;

	constructor(url: string | URL) {
		createdRuntimeUrls.push(url.toString());
	}

	addEventListener(_type: string, _listener: () => void): void {}

	close(): void {}

	send(_data: string): void {}
}

describe('createIcarosExperienceClient runtime URL resolution', () => {
	afterEach(() => {
		createdRuntimeUrls.length = 0;
		vi.unstubAllGlobals();
	});

	it('uses same-origin WSS as the fallback runtime socket', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE
		}).start();

		expect(createdRuntimeUrls).toEqual(['wss://client.local:5174/ws/runtime']);
	});

	it('derives a WSS runtime socket from an explicit HTTPS Host origin', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			hostOrigin: 'https://host.local:5183'
		}).start();

		expect(createdRuntimeUrls).toEqual(['wss://host.local:5183/ws/runtime']);
	});

	it('uses an explicit WSS runtime origin without changing the runtime path', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			runtimeOrigin: 'wss://host.local:5183'
		}).start();

		expect(createdRuntimeUrls).toEqual(['wss://host.local:5183/ws/runtime']);
	});

	it('rejects HTTP Host origins before opening a socket', () => {
		stubBrowser('client.local:5174');

		const client = createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			hostOrigin: 'http://host.local:5183'
		});

		expect(() => client.start()).toThrow('hostOrigin must use https for browser runtime sockets.');
		expect(createdRuntimeUrls).toEqual([]);
	});

	it('rejects plain WS runtime origins before opening a socket', () => {
		stubBrowser('client.local:5174');

		const client = createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			runtimeOrigin: 'ws://host.local:5183'
		});

		expect(() => client.start()).toThrow(
			'runtimeOrigin must not use http or ws for browser runtime sockets.'
		);
		expect(createdRuntimeUrls).toEqual([]);
	});
});

function stubBrowser(host: string): void {
	vi.stubGlobal('window', {
		location: {
			host,
			href: `https://${host}/experience`
		}
	});
	vi.stubGlobal('WebSocket', RuntimeUrlWebSocket);
}
