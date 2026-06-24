/**
 * Purpose: run the M5 pairing workflow and expose a constant-size status
 * snapshot for the operator console. USB is setup only; successful pairing
 * requires a later WebSocket frame from the paired controller over WLAN/LAN.
 */

import type { ChildProcess } from 'node:child_process';

import {
	type M5FirmwareStatus,
	REQUIRED_M5_FIRMWARE_VERSION,
	readM5FirmwareStatus
} from './m5-firmware-version';
import { redactDevicePairingToken } from './pairing';
import { startUsbScript as spawnUsbScript } from './usb-setup-script';
import {
	type ControllerPairingMetadata,
	hashDevicePairingToken,
	readSavedControllerConfig,
	writeControllerConfig,
	writeDebugSnapshot as writeDebugSnapshotFile
} from './usb-setup-storage';

const PAIRING_EVENT_PREFIX = 'PAIRING_EVENT ';
const WLAN_VERIFY_TIMEOUT_MS = 90_000;
const MAX_DEBUG_LINES = 300;
const USB_SETUP_RUNTIME_GLOBAL_KEY = Symbol.for('icaros.host.usbSetupRuntime');
const PAIRING_STATES = new Set<string>([
	'idle',
	'usb_connected',
	'usb_probe',
	'firmware_check',
	'firmware_update',
	'configure',
	'usb_test',
	'wlan_test',
	'ready',
	'failed',
	'aborted'
]);
const BUSY_PAIRING_STATES = new Set<PairingState>([
	'usb_connected',
	'usb_probe',
	'firmware_check',
	'firmware_update',
	'configure',
	'usb_test',
	'wlan_test'
]);
const FLASH_STATES = new Set<string>(['idle', 'running', 'succeeded', 'failed']);
const CONTROLLER_ISSUES: readonly Readonly<{
	matches: (line: string) => boolean;
	message: string;
}>[] = [
	{
		matches: (line) => line.includes('NO_AP_FOUND'),
		message: 'Controller findet die konfigurierte WLAN-SSID nicht.'
	},
	{
		matches: (line) => line.includes('AUTH_FAIL') || line.includes('AUTH_EXPIRE'),
		message: 'Controller lehnt die WLAN-Anmeldung ab. Passwort/SSID prüfen.'
	},
	{
		matches: (line) => line.includes('Connection refused'),
		message: 'Controller erreicht den WebSocket-Port, aber der Host lehnt die Verbindung ab.'
	},
	{
		matches: (line) => line.includes('Connection reset by peer'),
		message: 'Controller erreicht den Host, aber der WebSocket wird vor dem Pairing-Frame getrennt.'
	}
];

type PairingState =
	| 'idle'
	| 'usb_connected'
	| 'usb_probe'
	| 'firmware_check'
	| 'firmware_update'
	| 'configure'
	| 'usb_test'
	| 'wlan_test'
	| 'ready'
	| 'failed'
	| 'aborted';

type PairingStatusFields<TDebugLines> = {
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
	controllerIssue: string | null;
	message: string;
	error: string | null;
	exitCode: number | null;
	debugEnabled: boolean;
	debugLines: TDebugLines;
};

export type PairingDebugLine = Readonly<{
	id: number;
	timestamp: number;
	source: 'system' | 'script' | 'stderr' | 'event' | 'websocket';
	message: string;
}>;

type FlashState = 'idle' | 'running' | 'succeeded' | 'failed';

export type UsbSetupSnapshot = Readonly<
	PairingStatusFields<readonly PairingDebugLine[]> & {
		usbConnected: boolean;
		usbPort: string | null;
		firmwareStatus: M5FirmwareStatus;
		currentFirmwareVersion: string | null;
		requiredFirmwareVersion: string;
		flashState: FlashState;
		canConfigure: boolean;
	}
>;

export type UsbPairingInput = Readonly<{
	ssid: string | null;
	password: string | null;
	deviceId: string;
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
}>;

type MutablePairingStatus = PairingStatusFields<PairingDebugLine[]> & {
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
	usbConnected: boolean;
	usbPort: string | null;
	firmwareStatus: M5FirmwareStatus;
	currentFirmwareVersion: string | null;
	flashState: FlashState;
};

type PairingEvent = Readonly<{
	state?: PairingState;
	step?: string;
	progress?: number;
	deviceId?: string;
	firmwareVersion?: string;
	usbConnected?: boolean;
	usbPort?: string;
	flashState?: FlashState;
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
	currentChild: ChildProcess | null;
	nextDebugId: number;
};
type UsbScriptMode = Parameters<typeof spawnUsbScript>[0];
type UsbScriptStdio = Parameters<typeof spawnUsbScript>[1];

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
		currentChild: null,
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
		controllerIssue: null,
		message: 'Controller per USB anschließen und Pairing starten.',
		error: null,
		exitCode: null,
		debugEnabled: false,
		debugLines: [],
		staticIp: null,
		gateway: null,
		subnet: null,
		dns: null,
		usbConnected: false,
		usbPort: null,
		firmwareStatus: 'missing',
		currentFirmwareVersion: null,
		flashState: 'idle'
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
		controllerIssue: status.controllerIssue,
		message: status.message,
		error: status.error,
		exitCode: status.exitCode,
		debugEnabled: status.debugEnabled,
		debugLines: status.debugEnabled ? [...status.debugLines] : [],
		usbConnected: status.usbConnected,
		usbPort: status.usbPort,
		firmwareStatus: status.firmwareStatus,
		currentFirmwareVersion: status.currentFirmwareVersion,
		requiredFirmwareVersion: REQUIRED_M5_FIRMWARE_VERSION,
		flashState: status.flashState,
		canConfigure: canConfigureController()
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

	if (!canConfigureController()) {
		status.state = 'failed';
		status.step = 'Firmware prüfen';
		status.progress = 0;
		status.finishedAt = Date.now();
		status.message = 'Einrichten blockiert.';
		status.error = `Firmware muss zuerst auf ${REQUIRED_M5_FIRMWARE_VERSION} aktualisiert werden.`;
		appendDebug('system', `Configure blocked: firmwareStatus=${status.firmwareStatus}.`);
		writeDebugSnapshot();
		return getUsbSetupSnapshot();
	}

	resetStatus(serverUrl, input);
	writeControllerConfig(readControllerPairingMetadata());
	appendDebug('system', `Pairing started for ${redactDevicePairingToken(serverUrl)}.`);

	const child = startUsbScript('configure', 'pipe', 'Setup script error');
	if (child.stdin === null) {
		failPairing('Could not open stdin for USB setup script.');
		return getUsbSetupSnapshot();
	}
	child.stdin.end(JSON.stringify(buildScriptConfig(serverUrl, input)));
	watchUsbScriptProcess(child, 'Could not start USB setup script', (code) => {
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

export function abortUsbSetup(): UsbSetupSnapshot {
	if (!isPairingBusy(status.state)) {
		appendDebug('system', `Abort ignored while state=${status.state}.`);
		return getUsbSetupSnapshot();
	}

	clearWlanTimeout();
	const child = runtime.currentChild;
	runtime.currentChild = null;

	if (child !== null && !child.killed) {
		child.kill('SIGTERM');
	}

	status.state = 'aborted';
	status.step = 'Abgebrochen';
	status.progress = 0;
	status.finishedAt = Date.now();
	status.message = 'Laufender Controller-Workflow wurde abgebrochen.';
	status.error = null;
	status.exitCode = null;
	if (status.flashState === 'running') {
		status.flashState = 'failed';
	}
	appendDebug('system', 'USB workflow aborted by operator.');
	writeDebugSnapshot();
	return getUsbSetupSnapshot();
}

export function startUsbProbe(): UsbSetupSnapshot {
	if (isPairingBusy(status.state)) {
		return getUsbSetupSnapshot();
	}

	clearWlanTimeout();
	status.state = 'usb_probe';
	status.step = 'USB prüfen';
	status.progress = 5;
	status.startedAt = Date.now();
	status.finishedAt = null;
	status.error = null;
	status.exitCode = null;
	status.controllerIssue = null;
	status.message = 'USB-Probe gestartet.';
	status.usbConnected = false;
	status.usbPort = null;
	status.usbOk = false;
	status.flashState = status.flashState === 'running' ? 'idle' : status.flashState;
	appendDebug('system', 'USB probe started.');

	const child = startUsbScript('probe', 'ignore', 'USB probe script error');
	watchUsbScriptProcess(child, 'Could not start USB probe script', (code) => {
		if (status.state === 'failed' || code !== 0) {
			failPairing(status.error ?? `USB probe failed with exit code ${code ?? 'unknown'}.`);
			return;
		}
		status.finishedAt = Date.now();
		status.usbOk = status.usbConnected;
		if (status.usbConnected && status.serverUrl !== null && status.firmwareStatus === 'current') {
			status.state = 'wlan_test';
			status.step = 'WLAN/WebSocket prüfen';
			status.progress = 85;
			status.finishedAt = null;
			status.message = 'USB geprüft. Warte auf frischen Controller-Frame über WLAN/LAN.';
			startWlanTimeout();
			writeDebugSnapshot();
			return;
		}

		status.state = 'idle';
		status.step = 'USB geprüft';
		status.progress = 100;
		status.message = status.usbConnected
			? 'Controller per USB erkannt.'
			: 'Kein Controller per USB erkannt.';
		writeDebugSnapshot();
	});

	return getUsbSetupSnapshot();
}

export function startFirmwareFlash(): UsbSetupSnapshot {
	if (isPairingBusy(status.state)) {
		return getUsbSetupSnapshot();
	}

	clearWlanTimeout();
	status.state = 'firmware_update';
	status.step = 'Firmware aktualisieren';
	status.progress = 35;
	status.startedAt = Date.now();
	status.finishedAt = null;
	status.error = null;
	status.exitCode = null;
	status.controllerIssue = null;
	status.message = 'Firmware-Update gestartet.';
	status.flashState = 'running';
	appendDebug('system', 'Firmware flash started.');

	const child = startUsbScript('flash', 'ignore', 'Firmware flash script error');
	child.once('error', () => {
		status.flashState = 'failed';
	});
	watchUsbScriptProcess(child, 'Could not start firmware flash script', (code) => {
		if (status.state === 'failed' || code !== 0) {
			status.flashState = 'failed';
			failPairing(status.error ?? `Firmware flash failed with exit code ${code ?? 'unknown'}.`);
			return;
		}
		status.state = 'wlan_test';
		status.step = 'WLAN/WebSocket prüfen';
		status.progress = 85;
		status.finishedAt = null;
		status.flashState = 'succeeded';
		status.currentFirmwareVersion = REQUIRED_M5_FIRMWARE_VERSION;
		status.firmwareVersion = REQUIRED_M5_FIRMWARE_VERSION;
		status.firmwareStatus = 'current';
		status.message = 'Firmware aktualisiert. Warte auf gepaarten Controller über WLAN/LAN.';
		startWlanTimeout();
		writeDebugSnapshot();
	});

	return getUsbSetupSnapshot();
}

export function recordPairedDeviceFrame(frame: unknown, receivedAt: number = Date.now()): void {
	if (!canAcceptPairedDeviceFrame()) {
		appendDebug('websocket', `Ignoring paired frame while state=${status.state}.`);
		return;
	}

	restoreSavedControllerMetadataForReconnect();

	const deviceId = readStringProperty(frame, 'deviceId') ?? status.deviceId;
	const frameFirmwareVersion = readStringProperty(frame, 'firmwareVersion');
	appendDebug('websocket', `Paired frame received: ${summarizeFrame(frame)}.`);

	status.deviceId = deviceId;
	if (frameFirmwareVersion !== null) {
		status.firmwareVersion = frameFirmwareVersion;
		status.currentFirmwareVersion = frameFirmwareVersion;
		status.firmwareStatus = readM5FirmwareStatus(frameFirmwareVersion);
	}
	status.lastFrameAt = receivedAt;
	status.controllerIssue = null;
	status.wlanOk = true;
	status.state = 'ready';
	status.step = 'Bereit';
	status.progress = 100;
	status.finishedAt = receivedAt;
	status.message = status.usbOk
		? 'Controller verbunden. USB jetzt trennen.'
		: 'Controller im WLAN gefunden.';
	status.error = null;
	status.usbOk = true;
	clearWlanTimeout();
	writeControllerConfig(readControllerPairingMetadata());
	writeDebugSnapshot();
}

export function recordPairedDeviceSocketOpen(remote: string | null): void {
	appendDebug('websocket', `Paired device WebSocket connected from ${remote ?? 'unknown remote'}.`);
}

export function recordPairedDeviceSocketClose(remote: string | null): void {
	appendDebug('websocket', `Paired device WebSocket closed from ${remote ?? 'unknown remote'}.`);
	if (!status.wlanOk && status.state !== 'ready') {
		return;
	}

	status.wlanOk = false;
	status.state = 'wlan_test';
	status.step = 'WLAN/WebSocket prüfen';
	status.progress = 85;
	status.finishedAt = null;
	status.controllerIssue = 'Controller-WebSocket wurde getrennt. Warte auf erneuten Frame.';
	status.message = status.controllerIssue;
	status.error = null;
	startWlanTimeout();
	writeDebugSnapshot();
}

export function recordRejectedDeviceSocket(reason: string): void {
	appendDebug('websocket', `Rejected device WebSocket upgrade: ${reason}.`);
}

export function recordDeviceSocketUpgrade(details: DeviceUpgradeDiagnostics): void {
	appendDebug('websocket', `Device upgrade ${formatDeviceUpgradeDiagnostics(details)}.`);
}

function canAcceptPairedDeviceFrame(): boolean {
	if (status.state === 'wlan_test' || status.state === 'ready') {
		return status.startedAt !== null;
	}

	if (status.state === 'idle' || status.state === 'failed' || status.state === 'aborted') {
		return true;
	}

	return false;
}

function restoreSavedControllerMetadataForReconnect(): void {
	if (status.serverUrl !== null) {
		return;
	}

	const savedConfig = readSavedControllerConfig();
	if (savedConfig === null || savedConfig.tokenSha256 !== hashDevicePairingToken()) {
		return;
	}

	status.serverUrl = savedConfig.pairedUrl;
	status.deviceId = savedConfig.deviceId ?? status.deviceId;
	status.staticIp = savedConfig.staticIp;
	status.gateway = savedConfig.gateway;
	status.subnet = savedConfig.subnet;
	status.dns = savedConfig.dns;
}

function resetStatus(serverUrl: string, input: UsbPairingInput): void {
	const knownCurrentFirmware =
		status.firmwareStatus === 'current'
			? (status.currentFirmwareVersion ?? status.firmwareVersion)
			: null;

	clearWlanTimeout();
	status.state = 'usb_connected';
	status.step = 'USB verbinden';
	status.progress = 5;
	status.startedAt = Date.now();
	status.finishedAt = null;
	status.serverUrl = redactDevicePairingToken(serverUrl);
	status.deviceId = input.deviceId;
	status.firmwareVersion = knownCurrentFirmware;
	status.currentFirmwareVersion = knownCurrentFirmware;
	status.firmwareStatus = readM5FirmwareStatus(knownCurrentFirmware);
	status.usbOk = false;
	status.wlanOk = false;
	status.lastFrameAt = null;
	status.controllerIssue = null;
	status.message = 'Pairing gestartet.';
	status.error = null;
	status.exitCode = null;
	status.staticIp = input.staticIp;
	status.gateway = input.gateway;
	status.subnet = input.subnet;
	status.dns = input.dns;
	status.usbConnected = false;
	status.usbPort = null;
}

function startUsbScript(
	mode: UsbScriptMode,
	stdin: UsbScriptStdio,
	stderrFailurePrefix: string
): ChildProcess {
	const child = spawnUsbScript(
		mode,
		stdin,
		(chunk: string) => readScriptChunk(chunk),
		(chunk: string) => readScriptErrorChunk(chunk, stderrFailurePrefix)
	);
	runtime.currentChild = child;
	return child;
}

function watchUsbScriptProcess(
	child: ChildProcess,
	startFailureMessage: string,
	onClose: (code: number | null) => void
): void {
	child.on('error', (error) => {
		failPairing(`${startFailureMessage}: ${error.message}`);
	});
	child.on('close', (code) => {
		clearCurrentChild(child);
		if (status.state === 'aborted') {
			return;
		}
		status.exitCode = code;
		onClose(code);
	});
}

function readScriptErrorChunk(chunk: string, failurePrefix: string): void {
	const text = chunk.trim();
	if (text === '') {
		return;
	}

	appendDebug('stderr', text);
	if (status.state === 'firmware_update') {
		status.flashState = 'failed';
	}
	failPairing(`${failurePrefix}: ${text}`);
}

function readScriptChunk(chunk: string): void {
	for (const line of chunk.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '') {
			continue;
		}

		appendDebug('script', redactDevicePairingToken(trimmed));
		applyControllerSerialHint(trimmed);

		if (!trimmed.startsWith(PAIRING_EVENT_PREFIX)) {
			continue;
		}

		const event = parsePairingEvent(trimmed.slice(PAIRING_EVENT_PREFIX.length));
		if (event !== null) {
			applyPairingEvent(event);
		}
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
		status.currentFirmwareVersion = event.firmwareVersion;
		status.firmwareStatus = readM5FirmwareStatus(event.firmwareVersion);
	}
	if (event.usbConnected !== undefined) {
		status.usbConnected = event.usbConnected;
	}
	if (event.usbPort !== undefined) {
		status.usbPort = event.usbPort;
		status.usbConnected = true;
	}
	if (event.flashState !== undefined) {
		status.flashState = event.flashState;
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
	runtime.currentChild = null;
	if (status.state === 'firmware_update') {
		status.flashState = 'failed';
	}
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
			failPairing(
				status.controllerIssue ?? 'Controller did not connect over WLAN/LAN WebSocket in time.'
			);
		}
	}, WLAN_VERIFY_TIMEOUT_MS);
}

function clearWlanTimeout(): void {
	if (runtime.wlanTimer !== null) {
		clearTimeout(runtime.wlanTimer);
		runtime.wlanTimer = null;
	}
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
	writeDebugSnapshotFile(getUsbSetupSnapshot());
}

function applyControllerSerialHint(line: string): void {
	const issue = readControllerIssue(line);
	if (issue === null) {
		return;
	}

	status.controllerIssue = issue;
	if (status.state === 'usb_test' || status.state === 'wlan_test') {
		status.message = issue;
	}
	writeDebugSnapshot();
}

function readControllerPairingMetadata(): ControllerPairingMetadata {
	return {
		deviceId: status.deviceId ?? 'unknown',
		firmwareVersion: status.firmwareVersion,
		staticIp: status.staticIp,
		gateway: status.gateway,
		subnet: status.subnet,
		dns: status.dns,
		pairedUrl: status.serverUrl,
		configuredAt: readIsoTimestamp(status.startedAt, Date.now()),
		lastVerifiedAt: readOptionalIsoTimestamp(status.finishedAt),
		lastFrameAt: readOptionalIsoTimestamp(status.lastFrameAt)
	};
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

function parsePairingEvent(input: string): PairingEvent | null {
	try {
		const parsed: unknown = JSON.parse(input);
		if (!isRecord(parsed)) {
			return null;
		}

		return {
			state: readPairingState(parsed.state),
			step: readOptionalString(parsed.step),
			progress: readOptionalNumber(parsed.progress),
			deviceId: readOptionalString(parsed.deviceId),
			firmwareVersion: readOptionalString(parsed.firmwareVersion),
			usbConnected: readOptionalBoolean(parsed.usbConnected),
			usbPort: readOptionalString(parsed.usbPort),
			flashState: readFlashState(parsed.flashState),
			usbOk: readOptionalBoolean(parsed.usbOk),
			message: readOptionalString(parsed.message),
			error: readOptionalString(parsed.error)
		};
	} catch {
		return null;
	}
}

function redactEvent(event: PairingEvent): PairingEvent {
	return {
		...event,
		message: event.message === undefined ? undefined : redactDevicePairingToken(event.message),
		error: event.error === undefined ? undefined : redactDevicePairingToken(event.error)
	};
}

function readStringProperty(value: unknown, key: string): string | null {
	if (!isRecord(value)) {
		return null;
	}

	const property = value[key];
	return typeof property === 'string' && property.trim() !== '' ? property.trim() : null;
}

function summarizeFrame(frame: unknown): string {
	if (!isRecord(frame)) {
		return 'non-object frame';
	}

	const summary = {
		type: frame.type,
		deviceId: frame.deviceId,
		firmwareVersion: frame.firmwareVersion,
		pitch: frame.pitch,
		roll: frame.roll,
		quality: frame.quality
	};
	return JSON.stringify(summary);
}

function readControllerIssue(line: string): string | null {
	return CONTROLLER_ISSUES.find((issue) => issue.matches(line))?.message ?? null;
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

function isPairingBusy(state: PairingState): boolean {
	return BUSY_PAIRING_STATES.has(state);
}

function clampProgress(value: number): number {
	return Math.max(0, Math.min(100, Math.round(value)));
}

function readPairingState(value: unknown): PairingState | undefined {
	return isPairingState(value) ? value : undefined;
}

function isPairingState(value: unknown): value is PairingState {
	return typeof value === 'string' && PAIRING_STATES.has(value);
}

function readFlashState(value: unknown): FlashState | undefined {
	return typeof value === 'string' && FLASH_STATES.has(value) ? (value as FlashState) : undefined;
}

function readOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
	return typeof value === 'boolean' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readIsoTimestamp(value: number | null, fallback: number): string {
	return new Date(value ?? fallback).toISOString();
}

function readOptionalIsoTimestamp(value: number | null): string {
	return value === null ? '' : new Date(value).toISOString();
}

function clearCurrentChild(child: ChildProcess): void {
	if (runtime.currentChild === child) {
		runtime.currentChild = null;
	}
}

function canConfigureController(): boolean {
	return status.firmwareStatus === 'current';
}
