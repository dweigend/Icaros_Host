/**
 * Purpose: shared M5 pairing service for human UI actions and LLM-oriented CLI
 * diagnostics. This module owns orchestration only; transports such as Svelte
 * form actions, JSON endpoints, and scripts must stay thin adapters.
 */
import {
	createPairedDeviceWebSocketUrl,
	redactDevicePairingToken
} from '$lib/server/device/pairing';
import {
	abortUsbSetup,
	getUsbSetupSnapshot,
	setPairingDebugEnabled,
	startFirmwareFlash,
	startUsbProbe,
	startUsbSetup,
	type UsbPairingInput,
	type UsbSetupSnapshot
} from '$lib/server/device/usb-setup';
import { type HostConnectionInfo, resolveConnectionInfo } from '$lib/server/network';

const DEFAULT_USB_DEVICE_ID = 'icaros-station-a-m5';

export type M5PairingStatusView = Readonly<{
	connection: HostConnectionInfo & Readonly<{ pairedDeviceUrl: string }>;
	usbSetup: UsbSetupSnapshot;
}>;

export type M5PairingStartResult =
	| Readonly<{ ok: true; usbSetup: UsbSetupSnapshot }>
	| Readonly<{ ok: false; error: string; usbSetup: UsbSetupSnapshot }>;

export type M5PairingCommand =
	| Readonly<{ action: 'setDebug'; enabled: boolean }>
	| Readonly<{ action: 'connectUsb'; input: UsbPairingInput }>
	| Readonly<{ action: 'probeUsb' }>
	| Readonly<{ action: 'flashFirmware' }>
	| Readonly<{ action: 'abortUsb' }>;

export function getM5PairingStatus(url: URL): M5PairingStatusView {
	const connection = resolveConnectionInfo(url);
	const pairedDeviceUrl = createPairedDeviceWebSocketUrl(connection.wsOrigin);

	return {
		connection: {
			...connection,
			pairedDeviceUrl: redactDevicePairingToken(pairedDeviceUrl)
		},
		usbSetup: getUsbSetupSnapshot()
	};
}

export function parseM5PairingCommand(value: unknown): M5PairingCommand | null {
	if (!isRecord(value) || typeof value.action !== 'string') {
		return null;
	}

	if (value.action === 'setDebug') {
		return typeof value.enabled === 'boolean'
			? { action: 'setDebug', enabled: value.enabled }
			: null;
	}

	if (value.action === 'connectUsb') {
		const input = readUsbPairingInputFromRecord(value.input);
		return input === null ? null : { action: 'connectUsb', input };
	}

	if (value.action === 'probeUsb') {
		return { action: 'probeUsb' };
	}

	if (value.action === 'flashFirmware') {
		return { action: 'flashFirmware' };
	}

	if (value.action === 'abortUsb') {
		return { action: 'abortUsb' };
	}

	return null;
}

export function readUsbPairingInputFromForm(formData: FormData): UsbPairingInput {
	return {
		ssid: readFormString(formData, 'ssid'),
		password: readFormString(formData, 'password'),
		deviceId: readFormString(formData, 'deviceId') ?? DEFAULT_USB_DEVICE_ID,
		staticIp: readFormString(formData, 'staticIp'),
		gateway: readFormString(formData, 'gateway'),
		subnet: readFormString(formData, 'subnet'),
		dns: readFormString(formData, 'dns')
	};
}

export function runM5PairingCommand(url: URL, command: M5PairingCommand): M5PairingStartResult {
	if (command.action === 'setDebug') {
		return { ok: true, usbSetup: setPairingDebugEnabled(command.enabled) };
	}

	if (command.action === 'probeUsb') {
		return { ok: true, usbSetup: startUsbProbe() };
	}

	if (command.action === 'flashFirmware') {
		return { ok: true, usbSetup: startFirmwareFlash() };
	}

	if (command.action === 'abortUsb') {
		return { ok: true, usbSetup: abortUsbSetup() };
	}

	return startM5UsbPairing(url, command.input);
}

function startM5UsbPairing(url: URL, input: UsbPairingInput): M5PairingStartResult {
	if (input.ssid === null || input.password === null) {
		return {
			ok: false,
			error: 'WiFi SSID and password are required for pairing.',
			usbSetup: getUsbSetupSnapshot()
		};
	}

	const currentSetup = getUsbSetupSnapshot();
	if (!currentSetup.canConfigure) {
		return {
			ok: false,
			error: `Firmware must be updated to ${currentSetup.requiredFirmwareVersion} before setup.`,
			usbSetup: currentSetup
		};
	}

	const connection = resolveConnectionInfo(url);
	const pairedDeviceUrl = createPairedDeviceWebSocketUrl(connection.wsOrigin);
	const usbSetup = startUsbSetup(pairedDeviceUrl, input);

	return { ok: true, usbSetup };
}

function readUsbPairingInputFromRecord(value: unknown): UsbPairingInput | null {
	if (!isRecord(value)) {
		return null;
	}

	return {
		ssid: readNullableString(value.ssid),
		password: readNullableString(value.password),
		deviceId: readString(value.deviceId) ?? DEFAULT_USB_DEVICE_ID,
		staticIp: readNullableString(value.staticIp),
		gateway: readNullableString(value.gateway),
		subnet: readNullableString(value.subnet),
		dns: readNullableString(value.dns)
	};
}

function readFormString(formData: FormData, key: string): string | null {
	return readString(formData.get(key));
}

function readNullableString(value: unknown): string | null {
	return value === null || value === undefined ? null : readString(value);
}

function readString(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
