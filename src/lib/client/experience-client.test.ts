/**
 * Purpose: focused browser-client tests for the public experience-client
 * facade. It must keep control stream and launch registration sockets separate.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIcarosExperienceClient } from './experience-client';

const EXPERIENCE_ID = 'mountain-flight';
const CLIENT_ID = 'quest-client';
const TITLE = 'Mountain Flight';

const createdSocketUrls: string[] = [];

class TestWebSocket {
	static readonly OPEN = 1;

	readonly readyState = 0;

	constructor(url: string | URL) {
		createdSocketUrls.push(url.toString());
	}

	addEventListener(_type: string, _listener: () => void): void {}

	close(): void {}

	send(_data: string): void {}
}

describe('createIcarosExperienceClient socket URL resolution', () => {
	afterEach(() => {
		createdSocketUrls.length = 0;
		vi.unstubAllGlobals();
	});

	it('uses same-origin WSS for control stream and launch registration sockets', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE
		}).start();

		expect(createdSocketUrls).toEqual([
			'wss://client.local:5174/ws/control/main',
			'wss://client.local:5174/ws/runtime'
		]);
	});

	it('derives both sockets from an explicit HTTPS Host origin', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			hostOrigin: 'https://host.local:5183'
		}).start();

		expect(createdSocketUrls).toEqual([
			'wss://host.local:5183/ws/control/main',
			'wss://host.local:5183/ws/runtime'
		]);
	});

	it('uses an explicit WSS Host origin for both sockets without changing paths', () => {
		stubBrowser('client.local:5174');

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			runtimeOrigin: 'wss://host.local:5183'
		}).start();

		expect(createdSocketUrls).toEqual([
			'wss://host.local:5183/ws/control/main',
			'wss://host.local:5183/ws/runtime'
		]);
	});

	it('rejects HTTP Host origins before opening a socket', () => {
		stubBrowser('client.local:5174');

		const client = createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE,
			hostOrigin: 'http://host.local:5183'
		});

		expect(() => client.start()).toThrow('hostOrigin must not use http or ws for browser sockets.');
		expect(createdSocketUrls).toEqual([]);
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
			'controlOrigin must not use http or ws for browser sockets.'
		);
		expect(createdSocketUrls).toEqual([]);
	});
});

function stubBrowser(host: string): void {
	vi.stubGlobal('window', {
		location: {
			host,
			href: `https://${host}/experience`
		}
	});
	vi.stubGlobal('WebSocket', TestWebSocket);
}
