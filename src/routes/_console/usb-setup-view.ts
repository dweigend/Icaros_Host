/**
 * Purpose: route-private view helpers for M5 USB setup form and timing state.
 * This module is pure and does not start, stop, or mutate setup workflows.
 */
import { formatAge } from './format';
import type { HostConsoleUsbForm } from './types';

const DEFAULT_USB_DEVICE_ID = 'icaros-station-a-m5';

export function createDefaultUsbForm(): HostConsoleUsbForm {
	return {
		ssid: '',
		password: '',
		deviceId: DEFAULT_USB_DEVICE_ID,
		staticIp: '',
		gateway: '',
		subnet: '',
		dns: ''
	};
}

export function formatUsbSetupDuration(
	startedAt: number | null,
	finishedAt: number | null,
	now: number
): string {
	if (startedAt === null) {
		return 'not run';
	}

	return formatAge((finishedAt ?? now) - startedAt);
}
