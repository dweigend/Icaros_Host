/**
 * Purpose: isolated plain-WebSocket probe for M5 controller debugging.
 *
 * The probe opens `ws://<mac-lan-ip>:5184/ws/device`, logs every connection and
 * frame, and prints a normalized pitch/roll preview for orientation-like frames.
 * It is intentionally not wired into the Host runtime. Plain WS is allowed here
 * only because this script isolates the M5 device boundary from HTTPS runtime
 * and WebXR surfaces.
 */
import { networkInterfaces } from 'node:os';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';

type ProbeConfig = Readonly<{
	host: string;
	port: number;
	path: string;
	once: boolean;
}>;

type OrientationPreview = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 5184;
const DEFAULT_PATH = '/ws/device';
const MAX_ANGLE_DEGREES = 45;

const config = readConfig();
const server = new WebSocketServer({
	host: config.host,
	port: config.port,
	path: config.path
});

let connectionCount = 0;

server.on('listening', () => {
	console.log('[m5-probe] listening');
	for (const endpoint of listProbeEndpoints(config)) {
		console.log(`[m5-probe]   ${endpoint}`);
	}
	console.log('[m5-probe] configure the M5 to use the LAN endpoint above');
});

server.on('connection', (socket, request) => {
	connectionCount += 1;
	const remote = request.socket.remoteAddress ?? 'unknown';
	const remotePort = request.socket.remotePort ?? 0;
	console.log(`[m5-probe] connected #${connectionCount} from ${remote}:${remotePort}`);

	socket.on('message', (raw) => {
		const text = rawDataToString(raw);
		console.log(`[m5-probe] frame ${text}`);

		const preview = readOrientationPreview(text);
		if (preview === null) {
			console.log('[m5-probe] frame parsed, but no pitch/roll orientation found');
			return;
		}

		console.log(
			[
				'[m5-probe] orientation',
				`pitch=${preview.pitch}`,
				`roll=${preview.roll}`,
				`quality=${preview.quality}`,
				`safeMode=${preview.safeMode}`
			].join(' ')
		);

		if (config.once) {
			closeProbe(socket, 0);
		}
	});

	socket.on('close', (code, reason) => {
		console.log(`[m5-probe] disconnected code=${code} reason=${reason.toString()}`);
	});

	socket.on('error', (error) => {
		console.warn(`[m5-probe] socket error ${error.message}`);
	});
});

server.on('error', (error) => {
	console.error(`[m5-probe] server error ${error.message}`);
	process.exitCode = 1;
});

process.on('SIGINT', () => {
	console.log('\n[m5-probe] closing');
	closeProbe(null, 0);
});

function readConfig(): ProbeConfig {
	return {
		host: process.env.M5_PROBE_HOST ?? DEFAULT_HOST,
		port: readPort(process.env.M5_PROBE_PORT, DEFAULT_PORT),
		path: process.env.M5_PROBE_PATH ?? DEFAULT_PATH,
		once: process.argv.includes('--once')
	};
}

function readPort(value: string | undefined, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
		throw new Error(`invalid M5_PROBE_PORT: ${value}`);
	}

	return parsed;
}

function listProbeEndpoints(input: ProbeConfig): readonly string[] {
	const localUrls = [`ws://localhost:${input.port}${input.path}`];
	const lanUrls = listLanAddresses().map((address) => `ws://${address}:${input.port}${input.path}`);
	return [...localUrls, ...lanUrls];
}

function listLanAddresses(): readonly string[] {
	const addresses: string[] = [];

	for (const entries of Object.values(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family !== 'IPv4' || entry.internal) {
				continue;
			}

			addresses.push(entry.address);
		}
	}

	return addresses;
}

function rawDataToString(raw: RawData): string {
	if (Array.isArray(raw)) {
		return Buffer.concat(raw).toString('utf8');
	}

	if (raw instanceof ArrayBuffer) {
		return Buffer.from(new Uint8Array(raw)).toString('utf8');
	}

	return Buffer.from(raw).toString('utf8');
}

function readOrientationPreview(text: string): OrientationPreview | null {
	try {
		const parsed: unknown = JSON.parse(text);
		if (!isRecord(parsed)) {
			return null;
		}

		const pitch = firstNumber(parsed.pitch, parsed.angleY, parsed.rotationY);
		const roll = firstNumber(parsed.roll, parsed.angleX, parsed.rotationX);
		if (pitch === null || roll === null) {
			return null;
		}

		return {
			pitch: clampUnit(pitch / MAX_ANGLE_DEGREES),
			roll: clampUnit(roll / MAX_ANGLE_DEGREES),
			quality: readQuality(parsed.quality),
			safeMode: false
		};
	} catch {
		return null;
	}
}

function firstNumber(...values: readonly unknown[]): number | null {
	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
	}

	return null;
}

function readQuality(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return 1;
	}

	return clamp(value, 0, 1);
}

function clampUnit(value: number): number {
	return clamp(value, -1, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closeProbe(socket: WebSocket | null, exitCode: number): void {
	socket?.close();
	server.close(() => {
		process.exit(exitCode);
	});
}
