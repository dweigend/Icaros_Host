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
const sockets: TestWebSocket[] = [];
type TestWebSocketListener = (event: { data: string }) => void;

class TestWebSocket {
	static readonly OPEN = 1;

	readonly readyState = 0;
	readonly listeners = new Map<string, TestWebSocketListener[]>();

	constructor(url: string | URL) {
		createdSocketUrls.push(url.toString());
		sockets.push(this);
	}

	addEventListener(type: string, listener: TestWebSocketListener): void {
		this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
	}

	close(): void {}

	send(_data: string): void {}

	dispatchMessage(data: string): void {
		for (const listener of this.listeners.get('message') ?? []) {
			listener({ data });
		}
	}
}

describe('createIcarosExperienceClient socket URL resolution', () => {
	afterEach(() => {
		createdSocketUrls.length = 0;
		sockets.length = 0;
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

	it('stays on the runtime page when no launch client is selected yet', () => {
		const assign = vi.fn();
		stubBrowser('client.local:5174', assign);

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE
		}).start();

		sockets[1]?.dispatchMessage(
			JSON.stringify({
				type: 'station.state',
				payload: { selectedExperienceId: null, selectedLaunchClientId: null }
			})
		);

		expect(assign).not.toHaveBeenCalled();
	});

	it('returns to the console when another experience is selected', () => {
		const assign = vi.fn();
		stubBrowser('client.local:5174', assign);

		createIcarosExperienceClient({
			experienceId: EXPERIENCE_ID,
			clientId: CLIENT_ID,
			title: TITLE
		}).start();

		sockets[1]?.dispatchMessage(
			JSON.stringify({
				type: 'station.state',
				payload: { selectedExperienceId: 'city-tour', selectedLaunchClientId: 'other-client' }
			})
		);

		expect(assign).toHaveBeenCalledWith('https://client.local:5174/');
	});
});

function stubBrowser(host: string, assign = vi.fn()): void {
	vi.stubGlobal('window', {
		location: {
			host,
			href: `https://${host}/experience`,
			assign
		},
		navigator: {
			userAgent: 'vitest'
		},
		localStorage: {
			getItem: vi.fn(() => null),
			setItem: vi.fn()
		}
	});
	vi.stubGlobal('document', { title: TITLE });
	vi.stubGlobal('WebSocket', TestWebSocket);
}
