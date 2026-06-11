/**
 * Purpose: server-side data and actions for the single Icaros Host console.
 * The page updates the one M1 station state and exposes launch URLs without
 * owning experience assets.
 */
import { fail } from '@sveltejs/kit';

import {
	abortM5UsbWorkflow,
	flashM5Firmware,
	getM5PairingStatus,
	probeM5UsbController,
	setM5PairingDebug,
	startM5UsbPairing
} from '$lib/server/device/pairing-service';
import type { UsbPairingInput } from '$lib/server/device/usb-setup';
import { resolveLaunchClientUrl } from '$lib/server/launch';
import { createQuestLaunchUrl, resolveConnectionInfo } from '$lib/server/network';
import { setLaunchClientSelection } from '$lib/server/station/launch-selection';
import { stationStateStore } from '$lib/server/station/state';
import { runtimeClientRegistry } from '$lib/server/ws/runtime-clients';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const station = stationStateStore.getState();
	const connection = resolveConnectionInfo(url);
	const activeClient =
		station.activeClientId === null
			? null
			: runtimeClientRegistry.findSelectableClient(station.activeClientId);
	const launchTarget = resolveLaunchClientUrl(station.activeClientId, activeClient);
	const pairingStatus = getM5PairingStatus(url);

	return {
		connection: {
			...connection,
			questLaunchUrl: createQuestLaunchUrl(connection.httpOrigin),
			experienceTargetUrl: launchTarget.ok ? launchTarget.url : null,
			pairedDeviceUrl: pairingStatus.connection.pairedDeviceUrl
		},
		station,
		usbSetup: pairingStatus.usbSetup
	};
};

export const actions: Actions = {
	setSelectedLaunchClient: async ({ request }) => {
		const formData = await request.formData();
		const clientId = readOptionalFormValue(formData, 'clientId');

		if (clientId === null) {
			setLaunchClientSelection(null, null);
			return { ok: true };
		}

		const client = runtimeClientRegistry.findSelectableClient(clientId);
		if (client === null) {
			return fail(400, { message: 'Runtime client is not online.' });
		}

		setLaunchClientSelection(client.clientId, client.experienceId);
		return { ok: true };
	},
	connectUsb: async ({ request, url }) => {
		const formData = await request.formData();
		const pairingInput = readUsbPairingInput(formData);

		if (pairingInput === null) {
			return fail(400, { message: 'WiFi SSID and password are required for pairing.' });
		}

		const result = startM5UsbPairing(url, pairingInput);
		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	},
	probeUsbController: async () => {
		probeM5UsbController();

		return { ok: true };
	},
	flashM5Firmware: async () => {
		const result = flashM5Firmware();
		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	},
	abortUsbWorkflow: async () => {
		abortM5UsbWorkflow();

		return { ok: true };
	},
	setPairingDebug: async ({ request }) => {
		const formData = await request.formData();
		setM5PairingDebug(formData.get('enabled') === 'true');

		return { ok: true };
	}
};

function readUsbPairingInput(formData: FormData): UsbPairingInput | null {
	const ssid = readOptionalFormValue(formData, 'ssid');
	const password = readOptionalFormValue(formData, 'password');

	if (ssid === null || password === null) {
		return null;
	}

	return {
		ssid,
		password,
		deviceId: readOptionalFormValue(formData, 'deviceId') ?? 'icaros-station-a-m5',
		staticIp: readOptionalFormValue(formData, 'staticIp'),
		gateway: readOptionalFormValue(formData, 'gateway'),
		subnet: readOptionalFormValue(formData, 'subnet'),
		dns: readOptionalFormValue(formData, 'dns')
	};
}

function readOptionalFormValue(formData: FormData, key: string): string | null {
	const value = formData.get(key);
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}
