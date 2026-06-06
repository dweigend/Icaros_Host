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

export type M5PairingStatusView = Readonly<{
	connection: HostConnectionInfo & Readonly<{ pairedDeviceUrl: string }>;
	usbSetup: UsbSetupSnapshot;
}>;

export type M5PairingStartResult =
	| Readonly<{ ok: true; usbSetup: UsbSetupSnapshot }>
	| Readonly<{ ok: false; error: string; usbSetup: UsbSetupSnapshot }>;

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

export function setM5PairingDebug(enabled: boolean): UsbSetupSnapshot {
	return setPairingDebugEnabled(enabled);
}

export function probeM5UsbController(): M5PairingStartResult {
	return { ok: true, usbSetup: startUsbProbe() };
}

export function flashM5Firmware(): M5PairingStartResult {
	const currentSetup = getUsbSetupSnapshot();
	if (!currentSetup.canFlashFirmware) {
		return {
			ok: false,
			error: 'Firmware update disabled. Set ICAROS_ALLOW_M5_FIRMWARE_UPDATE=true.',
			usbSetup: currentSetup
		};
	}

	return { ok: true, usbSetup: startFirmwareFlash() };
}

export function abortM5UsbWorkflow(): UsbSetupSnapshot {
	return abortUsbSetup();
}

export function startM5UsbPairing(url: URL, input: UsbPairingInput): M5PairingStartResult {
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
