/**
 * Purpose: validation helpers for protocol data crossing filesystem, HTTP, and
 * WebSocket boundaries. They keep external data out of typed runtime state until
 * the M1 contract is proven.
 */
import {
	type ClientRegisterPayload,
	type ControlOrientation,
	type ExperienceManifest,
	type ExperienceMode,
	PROTOCOL_VERSION,
	type RequiredDevice,
	type StationState
} from './types';

export type ValidationResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

export function validateExperienceManifest(input: unknown): ValidationResult<ExperienceManifest> {
	if (!isRecord(input)) {
		return fail('manifest must be an object');
	}

	const id = readSlug(input.id, 'manifest.id must be a non-empty slug');
	if (!id.ok) {
		return id;
	}

	const title = readString(input.title, 'manifest.title must be a non-empty string');
	if (!title.ok) {
		return title;
	}

	const entry = readManifestEntry(input.entry, id.value);
	if (!entry.ok) {
		return entry;
	}

	const protocol = readProtocol(input.protocol);
	if (!protocol.ok) {
		return protocol;
	}

	const mode = readExperienceMode(input.mode);
	if (!mode.ok) {
		return mode;
	}

	const requiredDevices = readRequiredDevices(input.requiredDevices);
	if (!requiredDevices.ok) {
		return requiredDevices;
	}

	return ok({
		id: id.value,
		title: title.value,
		entry: entry.value,
		requiredDevices: requiredDevices.value,
		protocol: protocol.value,
		mode: mode.value
	});
}

export function validateClientRegisterPayload(
	input: unknown
): ValidationResult<ClientRegisterPayload> {
	if (!isRecord(input)) {
		return fail('client.register payload must be an object');
	}

	const role = readClientRole(input.role);
	if (!role.ok) {
		return role;
	}

	const id = readString(input.id, 'client.register id must be a non-empty string');
	if (!id.ok) {
		return id;
	}

	const experienceId = readOptionalSlug(input.experienceId);
	if (!experienceId.ok) {
		return experienceId;
	}

	return ok({
		role: role.value,
		id: id.value,
		...(experienceId.value === undefined ? {} : { experienceId: experienceId.value })
	});
}

export function validateStationState(input: unknown): ValidationResult<StationState> {
	if (!isRecord(input)) {
		return fail('station.state payload must be an object');
	}

	const activeExperienceId = readNullableSlug(input.activeExperienceId);

	if (!activeExperienceId.ok) {
		return activeExperienceId;
	}

	return ok({ activeExperienceId: activeExperienceId.value });
}

export function validateControlOrientation(input: unknown): ValidationResult<ControlOrientation> {
	if (!isRecord(input)) {
		return fail('control.orientation payload must be an object');
	}

	const pitch = readUnitNumber(input.pitch, 'control.orientation pitch must be a -1..1 number');
	if (!pitch.ok) {
		return pitch;
	}

	const roll = readUnitNumber(input.roll, 'control.orientation roll must be a -1..1 number');
	if (!roll.ok) {
		return roll;
	}

	const quality = readQualityNumber(input.quality);
	if (!quality.ok) {
		return quality;
	}

	if (input.source !== 'm5') {
		return fail('control.orientation source must be m5');
	}

	if (typeof input.safeMode !== 'boolean') {
		return fail('control.orientation safeMode must be boolean');
	}

	if (typeof input.timestamp !== 'number' || !Number.isFinite(input.timestamp)) {
		return fail('control.orientation timestamp must be a finite number');
	}

	return ok({
		pitch: pitch.value,
		roll: roll.value,
		quality: quality.value,
		source: 'm5',
		safeMode: input.safeMode,
		timestamp: input.timestamp
	});
}

export function isNonEmptySlug(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(error: string): ValidationResult<never> {
	return { ok: false, error };
}

function ok<TValue>(value: TValue): ValidationResult<TValue> {
	return { ok: true, value };
}

function readString(value: unknown, error: string): ValidationResult<string> {
	if (!isNonEmptyString(value)) {
		return fail(error);
	}

	return ok(value);
}

function readSlug(value: unknown, error: string): ValidationResult<string> {
	if (!isNonEmptySlug(value)) {
		return fail(error);
	}

	return ok(value);
}

function readOptionalSlug(value: unknown): ValidationResult<string | undefined> {
	if (value === undefined) {
		return ok(undefined);
	}

	return readSlug(value, 'client.register experienceId must be a slug when present');
}

function readNullableSlug(value: unknown): ValidationResult<string | null> {
	if (value === null) {
		return ok(null);
	}

	return readSlug(value, 'station.state activeExperienceId must be a slug or null');
}

function readManifestEntry(value: unknown, id: string): ValidationResult<string> {
	if (!isNonEmptyString(value)) {
		return fail(`manifest.entry must be a non-empty metadata string for ${id}`);
	}

	return ok(value);
}

function readProtocol(value: unknown): ValidationResult<typeof PROTOCOL_VERSION> {
	if (value !== PROTOCOL_VERSION) {
		return fail(`manifest.protocol must be ${PROTOCOL_VERSION}`);
	}

	return ok(value);
}

function readExperienceMode(value: unknown): ValidationResult<ExperienceMode> {
	if (!isExperienceMode(value)) {
		return fail('manifest.mode must be prototype or production');
	}

	return ok(value);
}

function readRequiredDevices(value: unknown): ValidationResult<readonly RequiredDevice[]> {
	if (!Array.isArray(value) || !value.every(isRequiredDevice)) {
		return fail('manifest.requiredDevices must contain quest and/or m5');
	}

	return ok(value);
}

function readClientRole(value: unknown): ValidationResult<ClientRegisterPayload['role']> {
	if (value !== 'operator' && value !== 'quest' && value !== 'experience') {
		return fail('client.register role must be operator, quest, or experience');
	}

	return ok(value);
}

function readUnitNumber(value: unknown, error: string): ValidationResult<number> {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < -1 || value > 1) {
		return fail(error);
	}

	return ok(value);
}

function readQualityNumber(value: unknown): ValidationResult<number> {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
		return fail('control.orientation quality must be a 0..1 number');
	}

	return ok(value);
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isExperienceMode(value: unknown): value is ExperienceMode {
	return value === 'prototype' || value === 'production';
}

function isRequiredDevice(value: unknown): value is RequiredDevice {
	return value === 'quest' || value === 'm5';
}
