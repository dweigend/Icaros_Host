/**
 * Purpose: persist non-secret M5 pairing metadata and bounded debug snapshots.
 * It only reads and writes local Host files; workflow decisions stay in
 * usb-setup.ts.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { readDevicePairingToken } from './pairing';

const PAIRING_CONFIG_FILE = resolve(process.cwd(), '.icaros/m5-controller.toml');
const DEBUG_SNAPSHOT_FILE = resolve(process.cwd(), '.icaros/debug/m5-pairing-debug.json');

export type ControllerPairingMetadata = Readonly<{
	deviceId: string;
	firmwareVersion: string | null;
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
	pairedUrl: string | null;
	configuredAt: string;
	lastVerifiedAt: string;
	lastFrameAt: string;
}>;

export type SavedControllerConfig = Readonly<{
	deviceId: string | null;
	firmwareVersion: string | null;
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
	pairedUrl: string | null;
	lastVerifiedAt: string | null;
	lastFrameAt: string | null;
	tokenSha256: string | null;
}>;

export function writeControllerConfig(metadata: ControllerPairingMetadata): void {
	mkdirSync(dirname(PAIRING_CONFIG_FILE), { recursive: true });
	writeFileSync(PAIRING_CONFIG_FILE, createControllerToml(metadata), 'utf8');
}

export function readSavedControllerConfig(): SavedControllerConfig | null {
	if (!existsSync(PAIRING_CONFIG_FILE)) {
		return null;
	}

	const values = parseFlatToml(readFileSync(PAIRING_CONFIG_FILE, 'utf8'));
	return {
		deviceId: values.get('controller.device_id') ?? null,
		firmwareVersion: emptyToNull(values.get('controller.firmware_version')),
		staticIp: emptyToNull(values.get('controller.static_ip')),
		gateway: emptyToNull(values.get('controller.gateway')),
		subnet: emptyToNull(values.get('controller.subnet')),
		dns: emptyToNull(values.get('controller.dns')),
		pairedUrl: emptyToNull(values.get('controller.paired_url')),
		lastVerifiedAt: emptyToNull(values.get('controller.last_verified_at')),
		lastFrameAt: emptyToNull(values.get('controller.last_frame_at')),
		tokenSha256: values.get('pairing.token_sha256') ?? null
	};
}

export function writeDebugSnapshot(snapshot: unknown): void {
	mkdirSync(dirname(DEBUG_SNAPSHOT_FILE), { recursive: true });
	writeFileSync(
		DEBUG_SNAPSHOT_FILE,
		`${JSON.stringify(
			{
				purpose: 'Bounded M5 pairing debug snapshot for local operator and LLM inspection.',
				updatedAt: new Date().toISOString(),
				status: snapshot
			},
			null,
			2
		)}\n`,
		'utf8'
	);
}

export function hashDevicePairingToken(): string {
	return createHash('sha256').update(readDevicePairingToken()).digest('hex');
}

function createControllerToml(metadata: ControllerPairingMetadata): string {
	const controllerFields: readonly [string, string | null][] = [
		['device_id', metadata.deviceId],
		['firmware_version', metadata.firmwareVersion],
		['static_ip', metadata.staticIp],
		['gateway', metadata.gateway],
		['subnet', metadata.subnet],
		['dns', metadata.dns],
		['paired_url', metadata.pairedUrl],
		['configured_at', metadata.configuredAt],
		['last_verified_at', metadata.lastVerifiedAt],
		['last_frame_at', metadata.lastFrameAt]
	];

	return [
		'# Purpose: non-secret Icaros Host M5 controller pairing metadata.',
		'# WiFi passwords and cleartext pairing tokens must not be stored here.',
		'',
		'[controller]',
		...controllerFields.map(formatTomlField),
		'',
		'[pairing]',
		`token_sha256 = "${hashDevicePairingToken()}"`,
		''
	].join('\n');
}

function parseFlatToml(input: string): Map<string, string> {
	const values = new Map<string, string>();
	let section: string | null = null;

	for (const line of input.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}

		if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
			section = trimmed.slice(1, -1).trim();
			continue;
		}

		if (section === null) {
			continue;
		}

		const entry = readTomlEntry(trimmed);
		if (entry === null) {
			continue;
		}

		values.set(`${section}.${entry.key}`, entry.value);
	}

	return values;
}

function readTomlEntry(line: string): Readonly<{ key: string; value: string }> | null {
	const separatorIndex = line.indexOf('=');
	if (separatorIndex < 0) {
		return null;
	}

	const key = line.slice(0, separatorIndex).trim();
	if (key === '') {
		return null;
	}

	const value = parseTomlString(line.slice(separatorIndex + 1).trim());
	return value === null ? null : { key, value };
}

function parseTomlString(value: string): string | null {
	if (!value.startsWith('"') || !value.endsWith('"')) {
		return null;
	}

	return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function emptyToNull(value: string | undefined): string | null {
	return value === undefined || value === '' ? null : value;
}

function formatTomlField([key, value]: readonly [string, string | null]): string {
	return `${key} = "${tomlEscape(value ?? '')}"`;
}

function tomlEscape(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
