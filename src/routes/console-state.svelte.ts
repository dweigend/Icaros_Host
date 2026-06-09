/**
 * Purpose: route-local reactive state and browser lifecycle helpers for the
 * single Icaros Host console page.
 */
import { invalidateAll } from '$app/navigation';

import type { StatusDotTone } from '$lib/components/status-dot';
import type { ControlOrientation, RuntimeClientSummary } from '$lib/protocol';
import type { PageData } from './$types';
import {
	createRuntimeDebugFrame,
	formatAge,
	parseControlStreamMessage,
	parseRuntimeRegistryMessage,
	type RuntimeDebugFrame,
	type RuntimeDebugStatus,
	toQualityPercent,
	toUnitPercent
} from './runtime-debug';

const DEBUG_FRAME_LIMIT = 12;
const DEFAULT_USB_DEVICE_ID = 'icaros-station-a-m5';
const USB_SETUP_REFRESH_MS = 1_000;
const CONSOLE_CLOCK_MS = 250;
const CONTROLLER_FRAME_FRESH_MS = 5_000;

export type ConsoleConnectionUrls = Readonly<{
	consoleUrl: string;
	questLaunchUrl: string;
	experienceTargetUrl: string | null;
	m5SocketUrl: string;
	controlSocketUrl: string;
	runtimeSocketUrl: string;
}>;

type ConsoleUsbPairingForm = {
	ssid: string;
	password: string;
	deviceId: string;
	staticIp: string;
	gateway: string;
	subnet: string;
	dns: string;
};

export type ConsolePageState = ReturnType<typeof createConsolePageState>;
type ControllerStatusIndicator = Readonly<{
	label: string;
	value: string;
	tone: StatusDotTone;
	detail: string;
}>;

type UsbSetupState = PageData['usbSetup']['state'];
type UsbSetup = PageData['usbSetup'];

export function createConsolePageState(readData: () => PageData) {
	let usbNow = $state(Date.now());
	let debugNow = $state(Date.now());
	let debugStatus = $state<RuntimeDebugStatus>('disconnected');
	let debugLastMessageAt = $state<number | null>(null);
	let debugFrameCount = $state(0);
	let runtimeRegistryActiveClientId = $state<string | null | undefined>(undefined);
	let runtimeClients = $state<readonly RuntimeClientSummary[]>([]);
	let debugLastControl = $state<ControlOrientation | null>(null);
	let debugFrames = $state<RuntimeDebugFrame[]>([]);
	let controlStreamSocket: WebSocket | null = null;
	let runtimeRegistrySocket: WebSocket | null = null;

	const usbForm: ConsoleUsbPairingForm = $state({
		ssid: '',
		password: '',
		deviceId: DEFAULT_USB_DEVICE_ID,
		staticIp: '',
		gateway: '',
		subnet: '',
		dns: ''
	});

	const connection = $derived(readData().connection);
	const station = $derived(readData().station);
	const usbSetup = $derived(readData().usbSetup);
	const activeClientId = $derived(station.activeClientId);
	const connectionUrls = $derived<ConsoleConnectionUrls>({
		consoleUrl: `${connection.httpOrigin}/`,
		questLaunchUrl: connection.questLaunchUrl,
		experienceTargetUrl: connection.experienceTargetUrl,
		m5SocketUrl: connection.pairedDeviceUrl,
		controlSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/control/main'),
		runtimeSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/runtime')
	});
	const runtimeActiveClientId = $derived(
		runtimeRegistryActiveClientId === undefined ? activeClientId : runtimeRegistryActiveClientId
	);
	const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
	const debugLastMessageAge = $derived(
		debugLastMessageAt === null ? 'never' : formatAge(debugNow - debugLastMessageAt)
	);
	const debugPitchPercent = $derived(toUnitPercent(debugLastControl?.pitch ?? 0));
	const debugRollPercent = $derived(toUnitPercent(debugLastControl?.roll ?? 0));
	const debugQualityPercent = $derived(toQualityPercent(debugLastControl?.quality ?? 0));
	const usbSetupTone = $derived(readUsbSetupTone(usbSetup, usbNow));
	const usbSetupDuration = $derived(
		formatUsbSetupDuration(usbSetup.startedAt, usbSetup.finishedAt, usbNow)
	);
	const usbSetupBusy = $derived(isUsbSetupBusy(usbSetup.state));
	const usbLastFrameAge = $derived(
		usbSetup.lastFrameAt === null ? 'never' : formatAge(usbNow - usbSetup.lastFrameAt)
	);
	const controllerIndicators = $derived(readControllerIndicators(usbSetup, usbLastFrameAge));

	$effect(() => {
		if (!isUsbSetupBusy(usbSetup.state) && usbSetup.state !== 'ready') {
			return;
		}

		const refresh = window.setInterval(() => {
			void invalidateAll();
		}, USB_SETUP_REFRESH_MS);

		return () => window.clearInterval(refresh);
	});

	function readControlStreamMessage(data: string): void {
		const control = parseControlStreamMessage(data);

		if (control === null) {
			return;
		}

		const receivedAt = Date.now();
		debugLastMessageAt = receivedAt;
		debugLastControl = control;
		debugFrameCount += 1;
		debugFrames = [
			createRuntimeDebugFrame(debugFrameCount, control, receivedAt),
			...debugFrames
		].slice(0, DEBUG_FRAME_LIMIT);
	}

	function readRuntimeRegistryMessage(data: string): void {
		const message = parseRuntimeRegistryMessage(data);

		if (message === null) {
			return;
		}

		if (message.type === 'station.state') {
			runtimeRegistryActiveClientId = message.payload.activeClientId;
			return;
		}

		runtimeClients = message.payload.clients;
	}

	function mountConsoleLiveSockets(): () => void {
		controlStreamSocket = new WebSocket(connectionUrls.controlSocketUrl);
		runtimeRegistrySocket = new WebSocket(connectionUrls.runtimeSocketUrl);
		debugStatus = 'connecting';

		const clock = window.setInterval(() => {
			const now = Date.now();
			debugNow = now;
			usbNow = now;
		}, CONSOLE_CLOCK_MS);

		controlStreamSocket.onopen = () => {
			debugStatus = 'connected';
		};

		controlStreamSocket.onmessage = (event: MessageEvent) => {
			readControlStreamMessage(String(event.data));
		};

		controlStreamSocket.onerror = () => {
			debugStatus = 'error';
		};

		controlStreamSocket.onclose = () => {
			debugStatus = 'disconnected';
			controlStreamSocket = null;
		};

		runtimeRegistrySocket.onmessage = (event: MessageEvent) => {
			readRuntimeRegistryMessage(String(event.data));
		};

		runtimeRegistrySocket.onclose = () => {
			runtimeRegistrySocket = null;
		};

		return () => {
			window.clearInterval(clock);
			controlStreamSocket?.close();
			runtimeRegistrySocket?.close();
			controlStreamSocket = null;
			runtimeRegistrySocket = null;
		};
	}

	return {
		usbForm,
		mountConsoleLiveSockets,
		get activeClientId() {
			return runtimeActiveClientId;
		},
		get runtimeClients() {
			return runtimeClients;
		},
		get connectionUrls() {
			return connectionUrls;
		},
		get usbSetup() {
			return usbSetup;
		},
		get usbSetupTone() {
			return usbSetupTone;
		},
		get usbSetupDuration() {
			return usbSetupDuration;
		},
		get usbSetupBusy() {
			return usbSetupBusy;
		},
		get usbLastFrameAge() {
			return usbLastFrameAge;
		},
		get controllerIndicators() {
			return controllerIndicators;
		},
		get debugStatus() {
			return debugStatus;
		},
		get debugStatusTone() {
			return debugStatusTone;
		},
		get debugLastControl() {
			return debugLastControl;
		},
		get debugFrames() {
			return debugFrames;
		},
		get debugFrameCount() {
			return debugFrameCount;
		},
		get debugLastMessageAge() {
			return debugLastMessageAge;
		},
		get debugNow() {
			return debugNow;
		},
		get debugPitchPercent() {
			return debugPitchPercent;
		},
		get debugRollPercent() {
			return debugRollPercent;
		},
		get debugQualityPercent() {
			return debugQualityPercent;
		}
	};
}

function readDebugStatusTone(status: RuntimeDebugStatus): StatusDotTone {
	if (status === 'connected') {
		return 'success';
	}

	if (status === 'connecting') {
		return 'warning';
	}

	if (status === 'error') {
		return 'danger';
	}

	return 'default';
}

function readUsbSetupTone(usbSetup: UsbSetup, now: number): StatusDotTone {
	if (usbSetup.state === 'ready') {
		return isControllerFrameFresh(usbSetup, now) ? 'success' : 'warning';
	}

	if (isUsbSetupBusy(usbSetup.state)) {
		return 'warning';
	}

	if (usbSetup.state === 'failed') {
		return 'danger';
	}

	return 'default';
}

function readControllerIndicators(
	usbSetup: UsbSetup,
	usbLastFrameAge: string
): readonly ControllerStatusIndicator[] {
	return [
		readUsbConnectedIndicator(usbSetup),
		readFirmwareIndicator(usbSetup),
		readFlashIndicator(usbSetup),
		readConfigureIndicator(usbSetup),
		readUsbStatusIndicator(usbSetup),
		readWlanIndicator(usbSetup, usbLastFrameAge)
	];
}

function readUsbConnectedIndicator(usbSetup: UsbSetup): ControllerStatusIndicator {
	if (usbSetup.state === 'usb_probe' || usbSetup.state === 'usb_connected') {
		return createIndicator('USB erkannt', 'prüfen', 'warning', usbSetup.step);
	}

	if (usbSetup.usbConnected) {
		return createIndicator('USB erkannt', 'ok', 'success', usbSetup.usbPort ?? 'Port erkannt');
	}

	if (usbSetup.state === 'failed') {
		return createIndicator('USB erkannt', 'fehlt', 'danger', usbSetup.error ?? 'Kein USB-Port');
	}

	return createIndicator('USB erkannt', 'pending', 'default', 'Noch nicht geprüft');
}

function readFirmwareIndicator(usbSetup: UsbSetup): ControllerStatusIndicator {
	if (usbSetup.state === 'firmware_check') {
		return createIndicator('Firmware', 'prüfen', 'warning', usbSetup.requiredFirmwareVersion);
	}

	if (usbSetup.firmwareStatus === 'current') {
		return createIndicator(
			'Firmware',
			'aktuell',
			'success',
			usbSetup.currentFirmwareVersion ?? usbSetup.requiredFirmwareVersion
		);
	}

	if (usbSetup.firmwareStatus === 'outdated') {
		return createIndicator(
			'Firmware',
			'alt',
			'danger',
			`${usbSetup.currentFirmwareVersion ?? 'unknown'} -> ${usbSetup.requiredFirmwareVersion}`
		);
	}

	if (usbSetup.firmwareStatus === 'missing') {
		return createIndicator('Firmware', 'fehlt', 'danger', usbSetup.requiredFirmwareVersion);
	}

	return createIndicator('Firmware', 'unbekannt', 'warning', usbSetup.requiredFirmwareVersion);
}

function readFlashIndicator(usbSetup: UsbSetup): ControllerStatusIndicator {
	if (usbSetup.flashState === 'running') {
		return createIndicator('Flash/Reset', 'läuft', 'warning', 'Upload aktiv');
	}

	if (usbSetup.flashState === 'succeeded') {
		return createIndicator('Flash/Reset', 'ok', 'success', 'Upload und Reset abgeschlossen');
	}

	if (!usbSetup.canFlashFirmware) {
		return createIndicator('Flash/Reset', 'gesperrt', 'danger', 'Policy deaktiviert');
	}

	if (usbSetup.flashState === 'failed') {
		return createIndicator(
			'Flash/Reset',
			'fehler',
			'danger',
			usbSetup.error ?? 'Upload fehlgeschlagen'
		);
	}

	return createIndicator('Flash/Reset', 'bereit', 'default', 'Explizite Aktion');
}

function readConfigureIndicator(usbSetup: UsbSetup): ControllerStatusIndicator {
	if (usbSetup.state === 'configure' || usbSetup.state === 'usb_test') {
		return createIndicator('Einrichten', 'läuft', 'warning', usbSetup.step);
	}

	if (usbSetup.usbOk && usbSetup.serverUrl !== null && usbSetup.state !== 'failed') {
		return createIndicator('Einrichten', 'ok', 'success', 'USB-Konfiguration akzeptiert');
	}

	if (usbSetup.state === 'failed') {
		return createIndicator('Einrichten', 'fehler', 'danger', usbSetup.error ?? 'Fehlgeschlagen');
	}

	if (!usbSetup.canConfigure) {
		return createIndicator(
			'Einrichten',
			'blockiert',
			'danger',
			`Firmware zuerst auf ${usbSetup.requiredFirmwareVersion} aktualisieren`
		);
	}

	return createIndicator('Einrichten', 'pending', 'default', 'Noch nicht eingerichtet');
}

function readUsbStatusIndicator(usbSetup: UsbSetup): ControllerStatusIndicator {
	const version = usbSetup.currentFirmwareVersion ?? usbSetup.firmwareVersion ?? 'unknown';
	const port = usbSetup.usbPort ?? 'kein Port';
	const tone = usbSetup.usbConnected || usbSetup.usbOk ? 'success' : 'default';
	return createIndicator('USB Status', version, tone, port);
}

function readWlanIndicator(usbSetup: UsbSetup, usbLastFrameAge: string): ControllerStatusIndicator {
	if (usbSetup.wlanOk && isControllerFrameFresh(usbSetup, Date.now())) {
		return createIndicator('WLAN/WebSocket', 'ok', 'success', `Frame ${usbLastFrameAge}`);
	}

	if (usbSetup.wlanOk) {
		return createIndicator(
			'WLAN/WebSocket',
			'stale',
			'warning',
			`Letzter Frame ${usbLastFrameAge}`
		);
	}

	if (usbSetup.state === 'wlan_test') {
		return createIndicator(
			'WLAN/WebSocket',
			'wartet',
			'warning',
			usbSetup.controllerIssue ?? 'Warte auf Controller-Frame'
		);
	}

	if (usbSetup.state === 'failed') {
		return createIndicator(
			'WLAN/WebSocket',
			'fehler',
			'danger',
			usbSetup.controllerIssue ?? usbSetup.error ?? 'Nicht verbunden'
		);
	}

	return createIndicator('WLAN/WebSocket', 'pending', 'default', 'Noch kein WLAN-Frame');
}

function createIndicator(
	label: string,
	value: string,
	tone: StatusDotTone,
	detail: string
): ControllerStatusIndicator {
	return { label, value, tone, detail };
}

function createBrowserSocketUrl(fallbackWsOrigin: string, path: string): string {
	if (typeof window === 'undefined') {
		return `${fallbackWsOrigin}${path}`;
	}

	return `wss://${window.location.host}${path}`;
}

function isControllerFrameFresh(usbSetup: UsbSetup, now: number): boolean {
	return (
		usbSetup.lastFrameAt !== null &&
		usbSetup.wlanOk &&
		now - usbSetup.lastFrameAt <= CONTROLLER_FRAME_FRESH_MS
	);
}

function formatUsbSetupDuration(
	startedAt: number | null,
	finishedAt: number | null,
	now: number
): string {
	if (startedAt === null) {
		return 'not run';
	}

	return formatAge((finishedAt ?? now) - startedAt);
}

function isUsbSetupBusy(state: UsbSetupState): boolean {
	return (
		state === 'usb_connected' ||
		state === 'usb_probe' ||
		state === 'firmware_check' ||
		state === 'firmware_update' ||
		state === 'configure' ||
		state === 'usb_test' ||
		state === 'wlan_test'
	);
}
