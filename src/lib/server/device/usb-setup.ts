/**
 * Purpose: run the M5 pairing workflow and expose a constant-size status
 * snapshot for the operator console. USB is setup only; successful pairing
 * requires a later WebSocket frame from the paired controller over WLAN/LAN.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readDevicePairingToken, redactDevicePairingToken } from './pairing';

const USB_SETUP_SCRIPT = resolve(process.cwd(), 'scripts/connect-m5-usb.py');
const PAIRING_CONFIG_FILE = resolve(process.cwd(), '.icaros/m5-controller.toml');
const DEBUG_SNAPSHOT_FILE = resolve(process.cwd(), '.icaros/debug/m5-pairing-debug.json');
const PAIRING_EVENT_PREFIX = 'PAIRING_EVENT ';
const WLAN_VERIFY_TIMEOUT_MS = 90_000;
const MAX_DEBUG_LINES = 300;
const USB_SETUP_RUNTIME_GLOBAL_KEY = Symbol.for('icaros.host.usbSetupRuntime');

export type PairingState =
	| 'idle'
	| 'usb_connected'
	| 'firmware_check'
	| 'firmware_update'
	| 'configure'
	| 'usb_test'
	| 'wlan_test'
	| 'ready'
	| 'failed';

export type UsbSetupSnapshot = Readonly<{
	state: PairingState;
	step: string;
	progress: number;
	startedAt: number | null;
	finishedAt: number | null;
	serverUrl: string | null;
	deviceId: string | null;
	firmwareVersion: string | null;
	usbOk: boolean;
	wlanOk: boolean;
	lastFrameAt: number | null;
	message: string;
	error: string | null;
	exitCode: number | null;
	debugEnabled: boolean;
	debugLines: readonly PairingDebugLine[];
}>;

export type PairingDebugLine = Readonly<{
	id: number;
	timestamp: number;
	source: 'system' | 'script' | 'stderr' | 'event' | 'websocket';
	message: string;
}>;

export type UsbPairingInput = Readonly<{
	ssid: string | null;
	password: string | null;
	deviceId: string;
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
}>;

type MutablePairingStatus = {
	state: PairingState;
	step: string;
	progress: number;
	startedAt: number | null;
	finishedAt: number | null;
	serverUrl: string | null;
	deviceId: string | null;
	firmwareVersion: string | null;
	usbOk: boolean;
	wlanOk: boolean;
	lastFrameAt: number | null;
	message: string;
	error: string | null;
	exitCode: number | null;
	debugEnabled: boolean;
	debugLines: PairingDebugLine[];
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
};

type PairingEvent = Readonly<{
	state?: PairingState;
	step?: string;
	progress?: number;
	deviceId?: string;
	firmwareVersion?: string;
	usbOk?: boolean;
	message?: string;
	error?: string;
}>;

export type DeviceUpgradeDiagnostics = Readonly<{
	remote: string | null;
	path: string;
	hasPairing: boolean;
	pairingFingerprint: string;
	expectedFingerprint: string;
	protocol: string | null;
	origin: string | null;
	decision: 'reject' | 'handleUpgrade' | 'accepted' | 'non-device-path';
	reason: string | null;
}>;

type UsbSetupRuntime = {
	status: MutablePairingStatus;
	wlanTimer: ReturnType<typeof setTimeout> | null;
	nextDebugId: number;
};

const runtime = readSharedRuntime();
const status = runtime.status;

function readSharedRuntime(): UsbSetupRuntime {
	const globalScope = globalThis as typeof globalThis & Record<symbol, UsbSetupRuntime | undefined>;
	const existingRuntime = globalScope[USB_SETUP_RUNTIME_GLOBAL_KEY];
	if (existingRuntime !== undefined) {
		return existingRuntime;
	}

	const nextRuntime = {
		status: createInitialStatus(),
		wlanTimer: null,
		nextDebugId: 1
	};
	globalScope[USB_SETUP_RUNTIME_GLOBAL_KEY] = nextRuntime;
	return nextRuntime;
}

function createInitialStatus(): MutablePairingStatus {
	return {
		state: 'idle',
		step: 'Warten auf Einrichtung',
		progress: 0,
		startedAt: null,
		finishedAt: null,
		serverUrl: null,
		deviceId: null,
		firmwareVersion: null,
		usbOk: false,
		wlanOk: false,
		lastFrameAt: null,
		message: 'Controller per USB anschließen und Pairing starten.',
		error: null,
		exitCode: null,
		debugEnabled: false,
		debugLines: [],
		staticIp: null,
		gateway: null,
		subnet: null,
		dns: null
	};
}

export function getUsbSetupSnapshot(): UsbSetupSnapshot {
	return {
		state: status.state,
		step: status.step,
		progress: status.progress,
		startedAt: status.startedAt,
		finishedAt: status.finishedAt,
		serverUrl: status.serverUrl,
		deviceId: status.deviceId,
		firmwareVersion: status.firmwareVersion,
		usbOk: status.usbOk,
		wlanOk: status.wlanOk,
		lastFrameAt: status.lastFrameAt,
		message: status.message,
		error: status.error,
		exitCode: status.exitCode,
		debugEnabled: status.debugEnabled,
		debugLines: status.debugEnabled ? [...status.debugLines] : []
	};
}

export function setPairingDebugEnabled(enabled: boolean): UsbSetupSnapshot {
	status.debugEnabled = enabled;
	if (!enabled) {
		status.debugLines = [];
	}
	appendDebug('system', enabled ? 'Debug mode enabled.' : 'Debug mode disabled.');
	writeDebugSnapshot();
	return getUsbSetupSnapshot();
}

export function startUsbSetup(serverUrl: string, input: UsbPairingInput): UsbSetupSnapshot {
	if (isPairingBusy(status.state)) {
		return getUsbSetupSnapshot();
	}

	resetStatus(serverUrl, input);
	appendDebug('system', `Pairing started for ${redactDevicePairingToken(serverUrl)}.`);

	const child = spawn('python3', buildScriptArgs(), {
		cwd: process.cwd(),
		stdio: ['pipe', 'pipe', 'pipe']
	});

	child.stdin.end(JSON.stringify(buildScriptConfig(serverUrl, input)));
	child.stdout.setEncoding('utf8');
	child.stderr.setEncoding('utf8');
	child.stdout.on('data', (chunk: string) => readScriptChunk(chunk));
	child.stderr.on('data', (chunk: string) => {
		const text = chunk.trim();
		if (text !== '') {
			appendDebug('stderr', text);
			failPairing(`Setup script error: ${text}`);
		}
	});

	child.on('error', (error) => {
		failPairing(`Could not start USB setup script: ${error.message}`);
	});

	child.on('close', (code) => {
		status.exitCode = code;
		if (status.state === 'ready') {
			return;
		}

		if (status.state === 'failed' || code !== 0) {
			failPairing(status.error ?? `USB setup failed with exit code ${code ?? 'unknown'}.`);
			return;
		}

		status.state = 'wlan_test';
		status.step = 'WLAN/WebSocket prüfen';
		status.progress = 85;
		status.usbOk = true;
		status.message = 'USB-Test erfolgreich. Warte auf gepaarten Controller über WLAN/LAN.';
		startWlanTimeout();
	});

	return getUsbSetupSnapshot();
}

export function recordPairedDeviceFrame(frame: unknown, receivedAt: number = Date.now()): void {
	if (!canAcceptPairedDeviceFrame()) {
		appendDebug('websocket', `Ignoring paired frame while state=${status.state}.`);
		return;
	}

	const deviceId = readStringProperty(frame, 'deviceId') ?? status.deviceId;
	const firmwareVersion = readStringProperty(frame, 'firmwareVersion') ?? status.firmwareVersion;
	appendDebug('websocket', `Paired frame received: ${summarizeFrame(frame)}.`);

	status.deviceId = deviceId;
	status.firmwareVersion = firmwareVersion;
	status.lastFrameAt = receivedAt;
	status.wlanOk = true;
	status.state = 'ready';
	status.step = 'Bereit';
	status.progress = 100;
	status.finishedAt = receivedAt;
	status.message = 'Controller verbunden. USB jetzt trennen.';
	status.error = null;
	clearWlanTimeout();
	writeControllerToml();
	writeDebugSnapshot();
}

export function recordPairedDeviceSocketOpen(remote: string | null): void {
	appendDebug('websocket', `Paired device WebSocket connected from ${remote ?? 'unknown remote'}.`);
}

export function recordPairedDeviceTcpConnection(remote: string | null): void {
	appendDebug('websocket', `Plain device TCP connection from ${remote ?? 'unknown remote'}.`);
}

export function recordRejectedDeviceSocket(reason: string): void {
	appendDebug('websocket', `Rejected device WebSocket upgrade: ${reason}.`);
}

export function recordDeviceSocketUpgrade(details: DeviceUpgradeDiagnostics): void {
	appendDebug('websocket', `Device upgrade ${formatDeviceUpgradeDiagnostics(details)}.`);
}

function canAcceptPairedDeviceFrame(): boolean {
	if (status.state === 'idle' || status.state === 'failed') {
		return false;
	}

	return status.startedAt !== null;
}

function resetStatus(serverUrl: string, input: UsbPairingInput): void {
	clearWlanTimeout();
	status.state = 'usb_connected';
	status.step = 'USB verbinden';
	status.progress = 5;
	status.startedAt = Date.now();
	status.finishedAt = null;
	status.serverUrl = redactDevicePairingToken(serverUrl);
	status.deviceId = input.deviceId;
	status.firmwareVersion = null;
	status.usbOk = false;
	status.wlanOk = false;
	status.lastFrameAt = null;
	status.message = 'Pairing gestartet.';
	status.error = null;
	status.exitCode = null;
	status.staticIp = input.staticIp;
	status.gateway = input.gateway;
	status.subnet = input.subnet;
	status.dns = input.dns;
}

function buildScriptArgs(): string[] {
	const args = [USB_SETUP_SCRIPT, '--config-stdin'];

	if (process.env.ICAROS_ALLOW_M5_FIRMWARE_UPDATE !== 'true') {
		args.push('--skip-firmware-update');
	}

	if (process.env.ICAROS_M5_REBOOT_AFTER_CONFIGURE !== 'false') {
		args.push('--reboot-after-configure');
	}

	return args;
}

function buildScriptConfig(
	serverUrl: string,
	input: UsbPairingInput
): Record<string, string | null> {
	return {
		serverUrl,
		deviceId: input.deviceId,
		ssid: input.ssid,
		password: input.password,
		staticIp: input.staticIp,
		gateway: input.gateway,
		subnet: input.subnet,
		dns: input.dns
	};
}

function readScriptChunk(chunk: string): void {
	for (const line of chunk.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '') {
			continue;
		}

		appendDebug('script', redactDevicePairingToken(trimmed));

		if (!trimmed.startsWith(PAIRING_EVENT_PREFIX)) {
			continue;
		}

		const event = parsePairingEvent(trimmed.slice(PAIRING_EVENT_PREFIX.length));
		if (event !== null) {
			applyPairingEvent(event);
		}
	}
}

function parsePairingEvent(input: string): PairingEvent | null {
	try {
		const parsed: unknown = JSON.parse(input);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function applyPairingEvent(event: PairingEvent): void {
	appendDebug('event', JSON.stringify(redactEvent(event)));
	if (event.state !== undefined) {
		status.state = event.state;
	}
	if (event.step !== undefined) {
		status.step = event.step;
	}
	if (event.progress !== undefined) {
		status.progress = clampProgress(event.progress);
	}
	if (event.deviceId !== undefined) {
		status.deviceId = event.deviceId;
	}
	if (event.firmwareVersion !== undefined) {
		status.firmwareVersion = event.firmwareVersion;
	}
	if (event.usbOk !== undefined) {
		status.usbOk = event.usbOk;
	}
	if (event.message !== undefined) {
		status.message = redactDevicePairingToken(event.message);
	}
	if (event.error !== undefined) {
		failPairing(redactDevicePairingToken(event.error));
	}
	writeDebugSnapshot();
}

function failPairing(error: string): void {
	clearWlanTimeout();
	status.state = 'failed';
	status.step = 'Fehler';
	status.finishedAt = Date.now();
	status.message = 'Pairing fehlgeschlagen.';
	status.error = redactDevicePairingToken(error);
	appendDebug('system', `Pairing failed: ${status.error}`);
	writeDebugSnapshot();
}

function startWlanTimeout(): void {
	clearWlanTimeout();
	runtime.wlanTimer = setTimeout(() => {
		if (status.state === 'wlan_test') {
			failPairing('Controller did not connect over WLAN/LAN WebSocket in time.');
		}
	}, WLAN_VERIFY_TIMEOUT_MS);
}

function clearWlanTimeout(): void {
	if (runtime.wlanTimer !== null) {
		clearTimeout(runtime.wlanTimer);
		runtime.wlanTimer = null;
	}
}

function writeControllerToml(): void {
	mkdirSync(dirname(PAIRING_CONFIG_FILE), { recursive: true });
	writeFileSync(PAIRING_CONFIG_FILE, createControllerToml(), 'utf8');
}

function appendDebug(source: PairingDebugLine['source'], message: string): void {
	if (!status.debugEnabled) {
		return;
	}

	status.debugLines = [
		...status.debugLines,
		{
			id: runtime.nextDebugId,
			timestamp: Date.now(),
			source,
			message: redactDevicePairingToken(message)
		}
	].slice(-MAX_DEBUG_LINES);
	runtime.nextDebugId += 1;
	writeDebugSnapshot();
}

function writeDebugSnapshot(): void {
	mkdirSync(dirname(DEBUG_SNAPSHOT_FILE), { recursive: true });
	writeFileSync(
		DEBUG_SNAPSHOT_FILE,
		`${JSON.stringify(
			{
				purpose: 'Bounded M5 pairing debug snapshot for local operator and LLM inspection.',
				updatedAt: new Date().toISOString(),
				status: getUsbSetupSnapshot()
			},
			null,
			2
		)}\n`,
		'utf8'
	);
}

function createControllerToml(): string {
	const tokenHash = createHash('sha256').update(readDevicePairingToken()).digest('hex');
	const verifiedAt = new Date(status.finishedAt ?? Date.now()).toISOString();
	return [
		'# Purpose: non-secret Icaros Host M5 controller pairing metadata.',
		'# WiFi passwords and cleartext pairing tokens must not be stored here.',
		'',
		'[controller]',
		`device_id = "${tomlEscape(status.deviceId ?? 'unknown')}"`,
		`firmware_version = "${tomlEscape(status.firmwareVersion ?? '')}"`,
		`static_ip = "${tomlEscape(status.staticIp ?? '')}"`,
		`gateway = "${tomlEscape(status.gateway ?? '')}"`,
		`subnet = "${tomlEscape(status.subnet ?? '')}"`,
		`dns = "${tomlEscape(status.dns ?? '')}"`,
		`paired_url = "${tomlEscape(status.serverUrl ?? '')}"`,
		`last_verified_at = "${verifiedAt}"`,
		`last_frame_at = "${new Date(status.lastFrameAt ?? Date.now()).toISOString()}"`,
		'',
		'[pairing]',
		`token_sha256 = "${tokenHash}"`,
		''
	].join('\n');
}

function readStringProperty(value: unknown, key: string): string | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const property = (value as Record<string, unknown>)[key];
	return typeof property === 'string' && property.trim() !== '' ? property.trim() : null;
}

function summarizeFrame(frame: unknown): string {
	if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) {
		return 'non-object frame';
	}

	const record = frame as Record<string, unknown>;
	const summary = {
		type: record.type,
		deviceId: record.deviceId,
		firmwareVersion: record.firmwareVersion,
		pitch: record.pitch,
		roll: record.roll,
		quality: record.quality
	};
	return JSON.stringify(summary);
}

function formatDeviceUpgradeDiagnostics(details: DeviceUpgradeDiagnostics): string {
	return [
		`remote=${details.remote ?? 'unknown'}`,
		`path=${details.path}`,
		`hasPairing=${details.hasPairing}`,
		`pairingFingerprint=${details.pairingFingerprint}`,
		`expectedFingerprint=${details.expectedFingerprint}`,
		`protocol=${details.protocol ?? '<none>'}`,
		`origin=${details.origin ?? '<none>'}`,
		`decision=${details.decision}`,
		`reason=${details.reason ?? '<none>'}`
	].join(' ');
}

function redactEvent(event: PairingEvent): PairingEvent {
	return {
		...event,
		message: event.message === undefined ? undefined : redactDevicePairingToken(event.message),
		error: event.error === undefined ? undefined : redactDevicePairingToken(event.error)
	};
}

function isPairingBusy(state: PairingState): boolean {
	return (
		state === 'usb_connected' ||
		state === 'firmware_check' ||
		state === 'firmware_update' ||
		state === 'configure' ||
		state === 'usb_test' ||
		state === 'wlan_test'
	);
}

function clampProgress(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function tomlEscape(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
