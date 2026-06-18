/**
 * Purpose: convert M5 setup snapshots into small status indicators for the
 * operator console. It does not mutate pairing state or inspect raw M5 frames.
 */
import type { StatusDotTone } from '$lib/components/status-dot';
import type {
	HostConsoleControllerIndicator,
	HostConsoleUsbSetup,
	HostConsoleUsbSetupState
} from './types';

const CONTROLLER_FRAME_FRESH_MS = 5_000;
const BUSY_USB_SETUP_STATES = new Set<HostConsoleUsbSetupState>([
	'usb_connected',
	'usb_probe',
	'firmware_check',
	'firmware_update',
	'configure',
	'usb_test',
	'wlan_test'
]);

export function readUsbSetupTone(usbSetup: HostConsoleUsbSetup, now: number): StatusDotTone {
	if (usbSetup.state === 'ready') {
		return isControllerFrameFresh(usbSetup, now) ? 'success' : 'warning';
	}

	if (isUsbSetupBusy(usbSetup.state)) {
		return 'warning';
	}

	return usbSetup.state === 'failed' ? 'danger' : 'default';
}

export function readControllerIndicators(
	usbSetup: HostConsoleUsbSetup,
	usbLastFrameAge: string,
	now: number
): readonly HostConsoleControllerIndicator[] {
	return [
		readUsbConnectedIndicator(usbSetup),
		readFirmwareIndicator(usbSetup),
		readFlashIndicator(usbSetup),
		readConfigureIndicator(usbSetup),
		readUsbStatusIndicator(usbSetup),
		readWlanIndicator(usbSetup, usbLastFrameAge, now)
	];
}

export function isUsbSetupBusy(state: HostConsoleUsbSetupState): boolean {
	return BUSY_USB_SETUP_STATES.has(state);
}

function readUsbConnectedIndicator(usbSetup: HostConsoleUsbSetup): HostConsoleControllerIndicator {
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

function readFirmwareIndicator(usbSetup: HostConsoleUsbSetup): HostConsoleControllerIndicator {
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

function readFlashIndicator(usbSetup: HostConsoleUsbSetup): HostConsoleControllerIndicator {
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

function readConfigureIndicator(usbSetup: HostConsoleUsbSetup): HostConsoleControllerIndicator {
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

function readUsbStatusIndicator(usbSetup: HostConsoleUsbSetup): HostConsoleControllerIndicator {
	const version = usbSetup.currentFirmwareVersion ?? usbSetup.firmwareVersion ?? 'unknown';
	const port = usbSetup.usbPort ?? 'kein Port';
	const tone = usbSetup.usbConnected || usbSetup.usbOk ? 'success' : 'default';
	return createIndicator('USB Status', version, tone, port);
}

function readWlanIndicator(
	usbSetup: HostConsoleUsbSetup,
	usbLastFrameAge: string,
	now: number
): HostConsoleControllerIndicator {
	if (usbSetup.wlanOk && isControllerFrameFresh(usbSetup, now)) {
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

function isControllerFrameFresh(usbSetup: HostConsoleUsbSetup, now: number): boolean {
	return (
		usbSetup.lastFrameAt !== null &&
		usbSetup.wlanOk &&
		now - usbSetup.lastFrameAt <= CONTROLLER_FRAME_FRESH_MS
	);
}

function createIndicator(
	label: string,
	value: string,
	tone: StatusDotTone,
	detail: string
): HostConsoleControllerIndicator {
	return { label, value, tone, detail };
}
