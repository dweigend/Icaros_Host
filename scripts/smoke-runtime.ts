/**
 * Purpose: executable smoke test for the local Icaros Host runtime contract.
 *
 * The script talks to a running Host process, sets one active experience id,
 * checks `/launch`, registers a runtime client, simulates one M5 frame, and
 * verifies that normalized `control.orientation` reaches the active client.
 * It does not replace Quest, certificate, or real firmware testing.
 */
import WebSocket from 'ws';

import {
	type ClientRegisteredPayload,
	type ControlOrientation,
	validateClientRegisteredPayload,
	validateControlOrientation
} from '../src/lib/protocol';
import { resolveDeviceWebSocketOrigin } from '../src/lib/server/device/pairing';

type SmokeConfig = Readonly<{
	hostOrigin: URL;
	experienceId: string;
	timeoutMs: number;
	pitch: number;
	roll: number;
	expectedExperienceUrl: string | null;
	clientUrl: string;
	devicePairingToken: string | null;
}>;

type RuntimeMessage =
	| Readonly<{
			type: 'control.orientation';
			payload: ControlOrientation;
	  }>
	| Readonly<{
			type: 'client.registered';
			payload: ClientRegisteredPayload;
	  }>;

const DEFAULT_HOST_ORIGIN = 'https://localhost:5183';
const DEFAULT_EXPERIENCE_ID = 'mountain-flight';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_PITCH = 22.5;
const DEFAULT_ROLL = -11.25;
const SMOKE_CLIENT_ID = 'smoke-runtime';

async function main(): Promise<void> {
	const config = readConfig();

	await setActiveExperience(config);
	const launchUrl = await readLaunchRedirect(config);
	const control = await verifyRuntimeControl(config);

	console.log(`activeExperienceId=${config.experienceId}`);
	console.log(`launchRedirect=${launchUrl}`);
	console.log(
		`control.orientation pitch=${control.pitch} roll=${control.roll} source=${control.source}`
	);
}

function readConfig(): SmokeConfig {
	const hostOrigin = new URL(process.env.ICAROS_SMOKE_HOST_ORIGIN ?? DEFAULT_HOST_ORIGIN);

	return {
		hostOrigin,
		experienceId: process.env.ICAROS_SMOKE_EXPERIENCE_ID ?? DEFAULT_EXPERIENCE_ID,
		timeoutMs: readNumber(process.env.ICAROS_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
		pitch: readNumber(process.env.ICAROS_SMOKE_PITCH, DEFAULT_PITCH),
		roll: readNumber(process.env.ICAROS_SMOKE_ROLL, DEFAULT_ROLL),
		expectedExperienceUrl: process.env.ICAROS_EXPECTED_EXPERIENCE_URL ?? null,
		clientUrl:
			process.env.ICAROS_SMOKE_CLIENT_URL ?? new URL('/smoke-runtime', hostOrigin).toString(),
		devicePairingToken: process.env.ICAROS_DEVICE_PAIRING_TOKEN ?? null
	};
}

async function setActiveExperience(config: SmokeConfig): Promise<void> {
	const response = await fetch(new URL('/?/setActive', config.hostOrigin), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Origin: config.hostOrigin.origin
		},
		body: new URLSearchParams({ experienceId: config.experienceId })
	});

	if (!response.ok) {
		throw new Error(`setActive failed with ${response.status}: ${await response.text()}`);
	}
}

async function readLaunchRedirect(config: SmokeConfig): Promise<string> {
	const response = await fetch(new URL('/launch', config.hostOrigin), {
		redirect: 'manual'
	});
	const location = response.headers.get('location');

	if (response.status !== 307 || location === null) {
		throw new Error(`launch expected 307 redirect, got ${response.status}`);
	}

	if (config.expectedExperienceUrl !== null && location !== config.expectedExperienceUrl) {
		throw new Error(`launch redirected to ${location}, expected ${config.expectedExperienceUrl}`);
	}

	return location;
}

function verifyRuntimeControl(config: SmokeConfig): Promise<ControlOrientation> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const runtime = new WebSocket(toWebSocketUrl(config.hostOrigin, '/ws/runtime'));
		let device: WebSocket | null = null;
		const timeout = setTimeout(() => {
			fail(new Error(`timed out waiting for control.orientation after ${config.timeoutMs}ms`));
		}, config.timeoutMs);

		const finish = (control: ControlOrientation): void => {
			if (settled) return;

			settled = true;
			clearTimeout(timeout);
			runtime.close();
			device?.close();
			resolve(control);
		};

		const fail = (error: Error): void => {
			if (settled) return;

			settled = true;
			clearTimeout(timeout);
			runtime.close();
			device?.close();
			reject(error);
		};

		runtime.on('open', () => {
			runtime.send(
				JSON.stringify({
					type: 'client.hello',
					payload: {
						role: 'experience',
						clientId: SMOKE_CLIENT_ID,
						experienceId: config.experienceId,
						title: 'Smoke Runtime',
						url: config.clientUrl,
						userAgent: 'icaros-smoke-runtime'
					}
				})
			);
		});

		runtime.on('message', async (data) => {
			const message = parseRuntimeMessage(data.toString());

			if (message?.type === 'client.registered') {
				try {
					await setActiveClient(config);
					device = openDeviceSocket(config, fail);
				} catch (error) {
					fail(error instanceof Error ? error : new Error(String(error)));
				}
				return;
			}

			if (message?.type !== 'control.orientation') {
				return;
			}

			if (message.payload.safeMode) {
				return;
			}

			finish(message.payload);
		});

		runtime.on('error', (error) => {
			fail(error);
		});
	});
}

async function setActiveClient(config: SmokeConfig): Promise<void> {
	const response = await fetch(new URL('/?/setActiveClient', config.hostOrigin), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Origin: config.hostOrigin.origin
		},
		body: new URLSearchParams({ clientId: SMOKE_CLIENT_ID })
	});

	if (!response.ok) {
		throw new Error(`setActiveClient failed with ${response.status}: ${await response.text()}`);
	}
}

function openDeviceSocket(config: SmokeConfig, fail: (error: Error) => void): WebSocket {
	const device = new WebSocket(toDeviceWebSocketUrl(config));

	device.on('open', () => {
		device.send(
			JSON.stringify({
				type: 'orientation',
				deviceId: 'smoke-m5',
				role: 'controller',
				seq: 1,
				timeMs: 0,
				quality: 1,
				pitch: config.pitch,
				roll: config.roll,
				yaw: 0
			})
		);
	});

	device.on('error', (error) => {
		fail(error);
	});

	return device;
}

function toDeviceWebSocketUrl(config: SmokeConfig): string {
	const url = new URL(
		'/ws/device',
		resolveDeviceWebSocketOrigin(toWebSocketUrl(config.hostOrigin, ''))
	);
	if (config.devicePairingToken !== null) {
		url.searchParams.set('pairing', config.devicePairingToken);
	}
	return url.toString();
}

function parseRuntimeMessage(data: string): RuntimeMessage | null {
	try {
		const parsed: unknown = JSON.parse(data);

		if (!isRecord(parsed) || typeof parsed.type !== 'string') {
			return null;
		}

		if (parsed.type === 'control.orientation') {
			const validation = validateControlOrientation(parsed.payload);
			return validation.ok ? { type: 'control.orientation', payload: validation.value } : null;
		}

		if (parsed.type === 'client.registered') {
			const validation = validateClientRegisteredPayload(parsed.payload);
			return validation.ok ? { type: 'client.registered', payload: validation.value } : null;
		}
	} catch {
		return null;
	}

	return null;
}

function toWebSocketUrl(origin: URL, path: string): string {
	return `wss://${origin.host}${path}`;
}

function readNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
