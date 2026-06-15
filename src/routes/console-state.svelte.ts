/**
 * Purpose: route-local reactive state and browser lifecycle helpers for the
 * single Icaros Host console page.
 */
import { invalidateAll } from '$app/navigation';
import { formatAge } from '$lib/blocks/host-console/format';
import type {
	HostConsoleConnectionUrls,
	HostConsoleControllerIndicator,
	HostConsoleState,
	HostConsoleUsbForm
} from '$lib/blocks/host-console/types';
import type { StatusDotTone } from '$lib/components/status-dot';
import type { PageData } from './$types';
import { createConsoleControlStreamState } from './console-control-stream-state.svelte';
import { createConsoleLaunchRegistryState } from './console-launch-registry-state.svelte';

const DEFAULT_USB_DEVICE_ID = 'icaros-station-a-m5';
const USB_SETUP_REFRESH_MS = 1_000;
const CONSOLE_CLOCK_MS = 250;
const CONTROLLER_FRAME_FRESH_MS = 5_000;

type ConsoleConnectionUrls = HostConsoleConnectionUrls;

type ConsoleUsbPairingForm = HostConsoleUsbForm;
type ControllerStatusIndicator = HostConsoleControllerIndicator;

type UsbSetupState = PageData['usbSetup']['state'];
type UsbSetup = PageData['usbSetup'];

export function createConsolePageState(readData: () => PageData): HostConsoleState {
	let usbNow = $state(Date.now());
	const controlStream = createConsoleControlStreamState();

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
	const selectedLaunchClientId = $derived(station.selectedLaunchClientId);
	const launchRegistry = createConsoleLaunchRegistryState(() => selectedLaunchClientId);
	const connectionUrls = $derived<ConsoleConnectionUrls>({
		consoleUrl: `${connection.httpOrigin}/`,
		questLaunchUrl: connection.questLaunchUrl,
		experienceTargetUrl: connection.experienceTargetUrl,
		m5SocketUrl: connection.pairedDeviceUrl,
		controlSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/control/main'),
		runtimeSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/runtime')
	});
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

	function mountConsoleLiveSockets(): () => void {
		const cleanupControlStream = controlStream.mount(connectionUrls.controlSocketUrl);
		const cleanupLaunchRegistry = launchRegistry.mount(connectionUrls.runtimeSocketUrl);

		const clock = window.setInterval(() => {
			const now = Date.now();
			controlStream.tick(now);
			usbNow = now;
		}, CONSOLE_CLOCK_MS);

		return () => {
			window.clearInterval(clock);
			cleanupControlStream();
			cleanupLaunchRegistry();
		};
	}

	return {
		usbForm,
		mountConsoleLiveSockets,
		get selectedLaunchClientId() {
			return launchRegistry.selectedLaunchClientId;
		},
		get runtimeClients() {
			return launchRegistry.runtimeClients;
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
			return controlStream.debugStatus;
		},
		get debugStatusTone() {
			return controlStream.debugStatusTone;
		},
		get debugLastControl() {
			return controlStream.debugLastControl;
		},
		get debugFrames() {
			return controlStream.debugFrames;
		},
		get debugFrameCount() {
			return controlStream.debugFrameCount;
		},
		get debugLastMessageAge() {
			return controlStream.debugLastMessageAge;
		},
		get debugNow() {
			return controlStream.debugNow;
		},
		get debugPitchPercent() {
			return controlStream.debugPitchPercent;
		},
		get debugRollPercent() {
			return controlStream.debugRollPercent;
		},
		get debugQualityPercent() {
			return controlStream.debugQualityPercent;
		}
	};
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
