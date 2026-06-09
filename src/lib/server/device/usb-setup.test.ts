/**
 * Purpose: lifecycle regression tests for Host-owned M5 setup state so startup
 * simplification cannot break already-paired controller reconnects.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCwd = process.cwd();
const originalToken = process.env.ICAROS_DEVICE_PAIRING_TOKEN;
let temporaryRoot: string | null = null;

afterEach(() => {
	process.chdir(originalCwd);
	if (originalToken === undefined) {
		delete process.env.ICAROS_DEVICE_PAIRING_TOKEN;
	} else {
		process.env.ICAROS_DEVICE_PAIRING_TOKEN = originalToken;
	}

	if (temporaryRoot !== null) {
		rmSync(temporaryRoot, { recursive: true, force: true });
		temporaryRoot = null;
	}

	delete (globalThis as Record<symbol, unknown>)[Symbol.for('icaros.host.usbSetupRuntime')];
	delete (globalThis as Record<symbol, unknown>)[Symbol.for('icaros.host.devicePairingToken')];
	vi.resetModules();
});

describe('recordPairedDeviceFrame', () => {
	it('accepts a paired controller frame without startup discovery', async () => {
		const token = 'startup-reconnect-token';
		const receivedAt = 1_725_000_000_000;
		await useTemporaryHostRoot(token);

		const { getUsbSetupSnapshot, recordPairedDeviceFrame } = await import('./usb-setup');

		expect(getUsbSetupSnapshot().state).toBe('idle');

		recordPairedDeviceFrame(
			{
				type: 'orientation',
				deviceId: 'icaros-station-a-m5',
				firmwareVersion: '0.2.2-icaros-ws-reconnect',
				pitch: 0,
				roll: 0,
				quality: 1
			},
			receivedAt
		);

		expect(getUsbSetupSnapshot()).toMatchObject({
			state: 'ready',
			step: 'Bereit',
			deviceId: 'icaros-station-a-m5',
			firmwareVersion: '0.2.2-icaros-ws-reconnect',
			wlanOk: true,
			lastFrameAt: receivedAt,
			error: null
		});
	});
});

async function useTemporaryHostRoot(token: string): Promise<void> {
	temporaryRoot = mkdtempSync(join(tmpdir(), 'icaros-host-usb-setup-'));
	process.chdir(temporaryRoot);
	process.env.ICAROS_DEVICE_PAIRING_TOKEN = token;

	await mkdir(join(temporaryRoot, '.icaros'), { recursive: true });
	writeFileSync(
		join(temporaryRoot, '.icaros/m5-controller.toml'),
		createSavedControllerToml(token),
		'utf8'
	);
}

function createSavedControllerToml(token: string): string {
	return [
		'[controller]',
		'device_id = "icaros-station-a-m5"',
		'firmware_version = "0.2.2-icaros-ws-reconnect"',
		'static_ip = ""',
		'gateway = ""',
		'subnet = ""',
		'dns = ""',
		'paired_url = "ws://192.168.50.194:5184/ws/device?pairing=redacted"',
		'last_verified_at = ""',
		'last_frame_at = ""',
		'',
		'[pairing]',
		`token_sha256 = "${createHash('sha256').update(token).digest('hex')}"`,
		''
	].join('\n');
}
