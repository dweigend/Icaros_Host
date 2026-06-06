/**
 * Purpose: service-level safety checks for M5 pairing orchestration so the UI
 * cannot configure WLAN on controllers with stale or unknown firmware.
 */
import { describe, expect, it } from 'vitest';

import { abortM5UsbWorkflow, flashM5Firmware, startM5UsbPairing } from './pairing-service';

describe('startM5UsbPairing', () => {
	it('blocks setup until the required firmware has been confirmed', () => {
		const result = startM5UsbPairing(new URL('https://localhost:5183/'), {
			ssid: 'test-wifi',
			password: 'test-password',
			deviceId: 'icaros-station-a-m5',
			staticIp: null,
			gateway: null,
			subnet: null,
			dns: null
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain(result.usbSetup.requiredFirmwareVersion);
			expect(result.usbSetup.canConfigure).toBe(false);
		}
	});
});

describe('flashM5Firmware', () => {
	it('reports a real command failure when firmware upload is disabled', () => {
		const result = flashM5Firmware();

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain('ICAROS_ALLOW_M5_FIRMWARE_UPDATE');
			expect(result.usbSetup.canFlashFirmware).toBe(false);
		}
	});
});

describe('abortM5UsbWorkflow', () => {
	it('does not overwrite a non-running pairing state', () => {
		const before = flashM5Firmware();
		const after = abortM5UsbWorkflow();

		expect(before.ok).toBe(false);
		expect(after.state).toBe(before.usbSetup.state);
		expect(after.error).toBe(before.usbSetup.error);
	});
});
