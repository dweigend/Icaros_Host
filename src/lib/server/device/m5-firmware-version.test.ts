/**
 * Purpose: regression tests for Host-side M5 firmware version expectations so
 * USB pairing cannot silently treat stale controller firmware as current.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REQUIRED_M5_FIRMWARE_VERSION, readM5FirmwareStatus } from './m5-firmware-version';

describe('readM5FirmwareStatus', () => {
	it('marks the required local firmware as current', () => {
		expect(readM5FirmwareStatus('0.2.2-icaros-ws-reconnect')).toBe('current');
	});

	it('marks old firmware as outdated', () => {
		expect(readM5FirmwareStatus('0.2.1-icaros-minimal')).toBe('outdated');
	});

	it('marks a missing firmware version as missing', () => {
		expect(readM5FirmwareStatus(null)).toBe('missing');
	});

	it('marks an empty firmware field as unknown', () => {
		expect(readM5FirmwareStatus('')).toBe('unknown');
	});
});

describe('M5 firmware version drift', () => {
	it('matches the embedded firmware constant', () => {
		const firmwareSource = readFileSync(
			resolve(process.cwd(), 'firmware/m5-controller/src/main.cpp'),
			'utf8'
		);

		expect(firmwareSource).toContain(`FirmwareVersion = "${REQUIRED_M5_FIRMWARE_VERSION}"`);
	});

	it('uses the local firmware project for upload', () => {
		const setupScript = readFileSync(resolve(process.cwd(), 'scripts/connect-m5-usb.py'), 'utf8');

		expect(setupScript).toContain('DEFAULT_FIRMWARE_DIR = Path("firmware/m5-controller")');
		expect(setupScript).toContain('"uvx"');
		expect(setupScript).not.toContain('M5_WebSocet_Adapter');
	});
});
