/**
 * Purpose: server-side data and actions for the single Icaros Host console.
 * This route-private adapter delegates behavior to reusable server services.
 */
import { fail } from '@sveltejs/kit';

import {
	getM5PairingStatus,
	readUsbPairingInputFromForm,
	runM5PairingCommand
} from '$lib/server/device/pairing-service';
import { readLaunchRoutingState, selectLaunchClient } from '$lib/server/launch';
import { createQuestLaunchUrl, resolveConnectionInfo } from '$lib/server/network';
import type { Actions, PageServerLoad } from '../../$types';

export const load: PageServerLoad = async ({ url }) => {
	const launchState = readLaunchRoutingState();
	const connection = resolveConnectionInfo(url);
	const pairingStatus = getM5PairingStatus(url);

	return {
		connection: {
			...connection,
			questLaunchUrl: createQuestLaunchUrl(connection.httpOrigin),
			experienceTargetUrl: launchState.target.ok ? launchState.target.url : null,
			pairedDeviceUrl: pairingStatus.connection.pairedDeviceUrl
		},
		station: launchState.station,
		usbSetup: pairingStatus.usbSetup
	};
};

export const actions: Actions = {
	setSelectedLaunchClient: async ({ request }) => {
		const formData = await request.formData();
		const result = selectLaunchClient(readOptionalFormValue(formData, 'clientId'));

		if (!result.ok) {
			return fail(result.status, { message: result.message });
		}

		return { ok: true };
	},
	connectUsb: async ({ request, url }) => {
		const input = readUsbPairingInputFromForm(await request.formData());
		const result = runM5PairingCommand(url, { action: 'connectUsb', input });

		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	},
	probeUsbController: async ({ url }) => {
		return runPairingAction(url, { action: 'probeUsb' });
	},
	flashM5Firmware: async ({ url }) => {
		return runPairingAction(url, { action: 'flashFirmware' });
	},
	abortUsbWorkflow: async ({ url }) => {
		return runPairingAction(url, { action: 'abortUsb' });
	},
	setPairingDebug: async ({ request, url }) => {
		const formData = await request.formData();
		return runPairingAction(url, {
			action: 'setDebug',
			enabled: formData.get('enabled') === 'true'
		});
	}
};

function runPairingAction(url: URL, command: Parameters<typeof runM5PairingCommand>[1]) {
	const result = runM5PairingCommand(url, command);

	if (!result.ok) {
		return fail(400, { message: result.error });
	}

	return { ok: true };
}

function readOptionalFormValue(formData: FormData, key: string): string | null {
	const value = formData.get(key);
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}
