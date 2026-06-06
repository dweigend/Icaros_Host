/**
 * Purpose: single Host-side source of truth for the expected local M5
 * controller firmware version. The embedded firmware and tests must stay in
 * sync with this value; this module does not perform USB or PlatformIO work.
 */

export const REQUIRED_M5_FIRMWARE_VERSION = '0.2.2-icaros-ws-reconnect';

export type M5FirmwareStatus = 'unknown' | 'current' | 'outdated' | 'missing';

export function readM5FirmwareStatus(version: string | null): M5FirmwareStatus {
	if (version === null) {
		return 'missing';
	}

	const trimmed = version.trim();
	if (trimmed === '') {
		return 'unknown';
	}

	return trimmed === REQUIRED_M5_FIRMWARE_VERSION ? 'current' : 'outdated';
}
