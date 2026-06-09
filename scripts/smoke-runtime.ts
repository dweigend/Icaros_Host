/**
 * Purpose: executable smoke test for the local Icaros Host runtime contract.
 *
 * The script talks to a running Host process, registers and selects one runtime
 * client, verifies `/launch` redirects to that client's HTTPS URL, simulates one
 * M5 frame, and verifies normalized `control.orientation` reaches the public
 * control stream. It does not replace Quest, certificate, or real firmware testing.
 */
import WebSocket from 'ws';

import {
	type ControlOrientation,
	createMessage,
	readHostRuntimeMessage
} from '../src/lib/protocol';
import {
	readDevicePairingToken,
	resolveDeviceWebSocketOrigin
} from '../src/lib/server/device/pairing';

type SmokeConfig = Readonly<{
	hostOrigin: URL;
	experienceId: string;
	timeoutMs: number;
	pitch: number;
	roll: number;
	clientUrl: string;
	devicePairingToken: string;
}>;

type SmokeRuntimeResult = Readonly<{
	launchUrl: string;
	control: ControlOrientation;
}>;

const DEFAULT_HOST_ORIGIN = 'https://localhost:5183';
const DEFAULT_EXPERIENCE_ID = 'mountain-flight';
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_PITCH = 22.5;
const DEFAULT_ROLL = -11.25;
const SMOKE_CLIENT_ID = 'smoke-runtime';

// Local smoke runs against self-signed lab certificates. The product path stays
// HTTPS/WSS-only; only this diagnostic client skips certificate verification.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main(): Promise<void> {
	const config = readConfig();

	const result = await verifyRuntimeClientLaunchAndControl(config);

	console.log(`activeClientId=${SMOKE_CLIENT_ID}`);
	console.log(`activeExperienceId=${config.experienceId}`);
	console.log(`registeredClientUrl=${config.clientUrl}`);
	console.log(`launchRedirect=${result.launchUrl}`);
	console.log(`control.orientation pitch=${result.control.pitch} roll=${result.control.roll}`);
}

function readConfig(): SmokeConfig {
	const hostOrigin = readHttpsOrigin(
		process.env.ICAROS_SMOKE_HOST_ORIGIN ?? DEFAULT_HOST_ORIGIN,
		'ICAROS_SMOKE_HOST_ORIGIN'
	);
	const clientUrl = readHttpsUrl(
		process.env.ICAROS_SMOKE_CLIENT_URL ?? new URL('/smoke-runtime', hostOrigin).toString(),
		'ICAROS_SMOKE_CLIENT_URL'
	);

	return {
		hostOrigin,
		experienceId: process.env.ICAROS_SMOKE_EXPERIENCE_ID ?? DEFAULT_EXPERIENCE_ID,
		timeoutMs: readNumber(process.env.ICAROS_SMOKE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
		pitch: readNumber(process.env.ICAROS_SMOKE_PITCH, DEFAULT_PITCH),
		roll: readNumber(process.env.ICAROS_SMOKE_ROLL, DEFAULT_ROLL),
		clientUrl,
		devicePairingToken: readOptionalEnv('ICAROS_DEVICE_PAIRING_TOKEN') ?? readDevicePairingToken()
	};
}

async function readLaunchRedirect(config: SmokeConfig): Promise<string> {
	const response = await fetch(new URL('/launch', config.hostOrigin), {
		redirect: 'manual'
	});
	const location = response.headers.get('location');

	if (response.status !== 307 || location === null) {
		throw new Error(`launch expected 307 redirect, got ${response.status}`);
	}

	if (location !== config.clientUrl) {
		throw new Error(
			`launch redirected to ${location}, expected registered client URL ${config.clientUrl}`
		);
	}

	return location;
}

function verifyRuntimeClientLaunchAndControl(config: SmokeConfig): Promise<SmokeRuntimeResult> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const runtime = new WebSocket(toWebSocketUrl(config.hostOrigin, '/ws/runtime'));
		let controlStream: WebSocket | null = null;
		let device: WebSocket | null = null;
		let launchUrl: string | null = null;
		const timeout = setTimeout(() => {
			fail(new Error(`timed out waiting for control.orientation after ${config.timeoutMs}ms`));
		}, config.timeoutMs);

		const finish = (control: ControlOrientation): void => {
			if (settled) return;

			const verifiedLaunchUrl = launchUrl;
			if (verifiedLaunchUrl === null) {
				fail(new Error('launch redirect was not verified before control delivery'));
				return;
			}

			settled = true;
			clearTimeout(timeout);
			runtime.close();
			controlStream?.close();
			device?.close();
			resolve({ launchUrl: verifiedLaunchUrl, control });
		};

		const fail = (error: Error): void => {
			if (settled) return;

			settled = true;
			clearTimeout(timeout);
			runtime.close();
			controlStream?.close();
			device?.close();
			reject(error);
		};

		runtime.on('open', () => {
			runtime.send(
				JSON.stringify(
					createMessage(
						'client.hello',
						{
							role: 'experience',
							clientId: SMOKE_CLIENT_ID,
							experienceId: config.experienceId,
							title: 'Smoke Runtime',
							url: config.clientUrl,
							userAgent: 'icaros-smoke-runtime'
						},
						{ role: 'experience', id: SMOKE_CLIENT_ID }
					)
				)
			);
		});

		runtime.on('message', async (data) => {
			const message = readHostRuntimeMessage(data.toString());

			if (message?.type === 'client.rejected') {
				fail(new Error(`client.hello rejected: ${message.payload.reason}`));
				return;
			}

			if (message?.type === 'client.registered') {
				if (message.payload.clientId !== SMOKE_CLIENT_ID) {
					fail(new Error(`registered unexpected client ${message.payload.clientId}`));
					return;
				}

				try {
					await setActiveClient(config);
					launchUrl = await readLaunchRedirect(config);
					controlStream = openControlStream(config, finish, fail);
					device = openDeviceSocket(config, fail);
				} catch (error) {
					fail(error instanceof Error ? error : new Error(String(error)));
				}
				return;
			}
		});

		runtime.on('close', () => {
			fail(new Error('runtime socket closed before smoke completed'));
		});

		runtime.on('error', (error) => {
			fail(toError(error));
		});
	});
}

async function setActiveClient(config: SmokeConfig): Promise<void> {
	const response = await fetch(new URL('/?/setActiveClient', config.hostOrigin), {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
			'x-sveltekit-action': 'true',
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
		fail(toError(error));
	});

	return device;
}

function openControlStream(
	config: SmokeConfig,
	finish: (control: ControlOrientation) => void,
	fail: (error: Error) => void
): WebSocket {
	const controlStream = new WebSocket(toWebSocketUrl(config.hostOrigin, '/ws/control/main'));

	controlStream.on('message', (data) => {
		const message = readHostRuntimeMessage(data.toString());
		if (message?.type === 'control.orientation' && !message.payload.safeMode) {
			finish(message.payload);
		}
	});
	controlStream.on('error', (error) => {
		fail(toError(error));
	});
	controlStream.on('close', () => {
		fail(new Error('control stream closed before smoke completed'));
	});

	return controlStream;
}

function toDeviceWebSocketUrl(config: SmokeConfig): string {
	const url = new URL(
		'/ws/device',
		resolveDeviceWebSocketOrigin(toWebSocketUrl(config.hostOrigin, ''))
	);
	url.searchParams.set('pairing', config.devicePairingToken);
	return url.toString();
}

function toWebSocketUrl(origin: URL, path: string): string {
	return `wss://${origin.host}${path}`;
}

function readHttpsOrigin(value: string, label: string): URL {
	const url = new URL(value);
	if (url.protocol !== 'https:') {
		throw new Error(`${label} must use https:// for runtime smoke checks.`);
	}

	return new URL(url.origin);
}

function readHttpsUrl(value: string, label: string): string {
	const url = new URL(value);
	if (url.protocol !== 'https:') {
		throw new Error(`${label} must use https:// for Quest-safe launch routing.`);
	}

	return url.toString();
}

function readOptionalEnv(name: string): string | null {
	const value = process.env[name]?.trim();
	return value === undefined || value === '' ? null : value;
}

function readNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toError(value: unknown): Error {
	if (value instanceof Error) {
		return value;
	}

	if (isRecord(value) && typeof value.message === 'string') {
		return new Error(value.message);
	}

	if (isRecord(value) && value.error instanceof Error) {
		return value.error;
	}

	return new Error(String(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
