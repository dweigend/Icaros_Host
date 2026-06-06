/**
 * Purpose: JSON adapter for LLM-oriented M5 pairing diagnostics.
 *
 * The human web console uses Svelte actions. The CLI uses this endpoint. Both
 * paths call the shared server-side pairing service instead of duplicating USB,
 * URL, or WebSocket pairing logic.
 */
import { json } from '@sveltejs/kit';

import {
	abortM5UsbWorkflow,
	flashM5Firmware,
	getM5PairingStatus,
	probeM5UsbController,
	setM5PairingDebug,
	startM5UsbPairing
} from '$lib/server/device/pairing-service';
import type { UsbPairingInput } from '$lib/server/device/usb-setup';
import type { RequestHandler } from './$types';

type M5PairingCommand =
	| Readonly<{ action: 'setDebug'; enabled: boolean }>
	| Readonly<{ action: 'connectUsb'; input: UsbPairingInput }>
	| Readonly<{ action: 'probeUsb' }>
	| Readonly<{ action: 'flashFirmware' }>
	| Readonly<{ action: 'abortUsb' }>;

export const GET: RequestHandler = ({ url }) => {
	return json(getM5PairingStatus(url));
};

export const POST: RequestHandler = async ({ request, url }) => {
	const command = parseCommand(await request.json().catch(() => null));

	if (command === null) {
		return json({ ok: false, error: 'Invalid M5 pairing command.' }, { status: 400 });
	}

	if (command.action === 'setDebug') {
		return json({ ok: true, usbSetup: setM5PairingDebug(command.enabled) });
	}

	if (command.action === 'probeUsb') {
		return json(probeM5UsbController());
	}

	if (command.action === 'flashFirmware') {
		const result = flashM5Firmware();
		return json(result, { status: result.ok ? 200 : 400 });
	}

	if (command.action === 'abortUsb') {
		return json({ ok: true, usbSetup: abortM5UsbWorkflow() });
	}

	const result = startM5UsbPairing(url, command.input);
	if (!result.ok) {
		return json(result, { status: 400 });
	}

	return json(result);
};

function parseCommand(value: unknown): M5PairingCommand | null {
	if (!isRecord(value) || typeof value.action !== 'string') {
		return null;
	}

	if (value.action === 'setDebug') {
		return typeof value.enabled === 'boolean'
			? { action: 'setDebug', enabled: value.enabled }
			: null;
	}

	if (value.action === 'connectUsb') {
		const input = parseUsbPairingInput(value.input);
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

function parseUsbPairingInput(value: unknown): UsbPairingInput | null {
	if (!isRecord(value)) {
		return null;
	}

	return {
		ssid: readNullableString(value.ssid),
		password: readNullableString(value.password),
		deviceId: readString(value.deviceId) ?? 'icaros-station-a-m5',
		staticIp: readNullableString(value.staticIp),
		gateway: readNullableString(value.gateway),
		subnet: readNullableString(value.subnet),
		dns: readNullableString(value.dns)
	};
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
