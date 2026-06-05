/**
 * Purpose: server-side data and actions for the single Icaros Host console.
 * The page updates the one M1 station state and exposes launch URLs without
 * owning experience assets.
 */
import { fail } from '@sveltejs/kit';

import { isNonEmptySlug } from '$lib/protocol';
import {
	createPairedDeviceWebSocketUrl,
	redactDevicePairingToken
} from '$lib/server/device/pairing';
import {
	getUsbSetupSnapshot,
	setPairingDebugEnabled,
	startUsbSetup
} from '$lib/server/device/usb-setup';
import { resolveExperienceLaunchUrl } from '$lib/server/experiences';
import { resolveConnectionInfo } from '$lib/server/network';
import { setActiveExperience } from '$lib/server/station/active-experience';
import { stationStateStore } from '$lib/server/station/state';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const station = stationStateStore.getState();
	const connection = resolveConnectionInfo(url);
	const launchTarget = resolveExperienceLaunchUrl(station.activeExperienceId, url);
	const pairedDeviceUrl = createPairedDeviceWebSocketUrl(connection.wsOrigin);

	return {
		connection: {
			...connection,
			questLaunchUrl: new URL('/launch', connection.httpOrigin).toString(),
			experienceTargetUrl: launchTarget.ok ? launchTarget.url : null,
			pairedDeviceUrl: redactDevicePairingToken(pairedDeviceUrl)
		},
		station,
		usbSetup: getUsbSetupSnapshot()
	};
};

export const actions: Actions = {
	setActive: async ({ request }) => {
		const formData = await request.formData();
		const rawExperienceId = formData.get('experienceId');
		const activeExperienceId = rawExperienceId === '' ? null : rawExperienceId;

		if (activeExperienceId !== null && !isNonEmptySlug(activeExperienceId)) {
			return fail(400, { message: 'Invalid experience id.' });
		}

		const result = setActiveExperience(activeExperienceId);

		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	},
	connectUsb: async ({ request, url }) => {
		const formData = await request.formData();
		const connection = resolveConnectionInfo(url);
		const pairingInput = readUsbPairingInput(formData);

		if (pairingInput === null) {
			return fail(400, { message: 'WiFi SSID and password are required for pairing.' });
		}

		startUsbSetup(createPairedDeviceWebSocketUrl(connection.wsOrigin), pairingInput);

		return { ok: true };
	},
	setPairingDebug: async ({ request }) => {
		const formData = await request.formData();
		setPairingDebugEnabled(formData.get('enabled') === 'true');

		return { ok: true };
	}
};

function readUsbPairingInput(formData: FormData) {
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
