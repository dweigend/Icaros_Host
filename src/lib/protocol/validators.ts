/**
 * Purpose: validation helpers for protocol data crossing filesystem, HTTP, and
 * WebSocket boundaries. They keep external data out of typed runtime state until
 * the station contract is proven.
 */
import type {
	ClientHeartbeatPayload,
	ClientHelloPayload,
	ClientRegisteredPayload,
	ClientRejectedPayload,
	ControlOrientation,
	RuntimeClientSummary,
	RuntimeClientsPayload,
	StationState
} from './types';

export type ValidationResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

export type HostRuntimeMessage =
	| Readonly<{ type: 'client.registered'; payload: ClientRegisteredPayload }>
	| Readonly<{ type: 'client.rejected'; payload: ClientRejectedPayload }>
	| Readonly<{ type: 'control.orientation'; payload: ControlOrientation }>
	| Readonly<{ type: 'station.state'; payload: StationState }>;

export function readHostRuntimeMessage(data: string): HostRuntimeMessage | null {
	try {
		const parsed: unknown = JSON.parse(data);
		if (!isHostRuntimeMessageEnvelope(parsed)) {
			return null;
		}

		switch (parsed.type) {
			case 'client.registered':
				return readValidatedMessage(parsed.type, parsed.payload, validateClientRegisteredPayload);
			case 'client.rejected':
				return readValidatedMessage(parsed.type, parsed.payload, validateClientRejectedPayload);
			case 'control.orientation':
				return readValidatedMessage(parsed.type, parsed.payload, validateControlOrientation);
			case 'station.state':
				return readValidatedMessage(parsed.type, parsed.payload, validateStationState);
			default:
				return null;
		}
	} catch {
		return null;
	}
}

export function validateClientHelloPayload(input: unknown): ValidationResult<ClientHelloPayload> {
	if (!isRecord(input)) {
		return fail('client.hello payload must be an object');
	}

	if (input.role !== 'experience') {
		return fail('client.hello role must be experience');
	}

	const clientId = readString(input.clientId, 'client.hello clientId must be a non-empty string');
	if (!clientId.ok) {
		return clientId;
	}

	const experienceId = readSlug(input.experienceId, 'client.hello experienceId must be a slug');
	if (!experienceId.ok) {
		return experienceId;
	}

	const title = readString(input.title, 'client.hello title must be a non-empty string');
	if (!title.ok) {
		return title;
	}

	const url = readHttpsUrl(input.url, 'client.hello url must be an https URL');
	if (!url.ok) {
		return url;
	}

	const userAgent = readOptionalString(input.userAgent, 'client.hello userAgent must be a string');
	if (!userAgent.ok) {
		return userAgent;
	}

	return ok({
		role: 'experience',
		clientId: clientId.value,
		experienceId: experienceId.value,
		title: title.value,
		url: url.value,
		...(userAgent.value === undefined ? {} : { userAgent: userAgent.value })
	});
}

export function validateClientHeartbeatPayload(
	input: unknown
): ValidationResult<ClientHeartbeatPayload> {
	if (!isRecord(input)) {
		return fail('client.heartbeat payload must be an object');
	}

	const clientId = readString(
		input.clientId,
		'client.heartbeat clientId must be a non-empty string'
	);
	if (!clientId.ok) {
		return clientId;
	}

	return ok({ clientId: clientId.value });
}

export function validateClientRegisteredPayload(
	input: unknown
): ValidationResult<ClientRegisteredPayload> {
	if (!isRecord(input)) {
		return fail('client.registered payload must be an object');
	}

	const clientId = readString(
		input.clientId,
		'client.registered clientId must be a non-empty string'
	);
	if (!clientId.ok) {
		return clientId;
	}

	if (typeof input.selectedForLaunch !== 'boolean') {
		return fail('client.registered selectedForLaunch must be boolean');
	}

	const selectedLaunchClientId = readNullableString(
		input.selectedLaunchClientId,
		'client.registered selectedLaunchClientId must be a non-empty string or null'
	);
	if (!selectedLaunchClientId.ok) {
		return selectedLaunchClientId;
	}

	return ok({
		clientId: clientId.value,
		selectedForLaunch: input.selectedForLaunch,
		selectedLaunchClientId: selectedLaunchClientId.value
	});
}

function validateClientRejectedPayload(input: unknown): ValidationResult<ClientRejectedPayload> {
	if (!isRecord(input)) {
		return fail('client.rejected payload must be an object');
	}

	const reason = readString(input.reason, 'client.rejected reason must be a non-empty string');
	if (!reason.ok) {
		return reason;
	}

	return ok({ reason: reason.value });
}

export function validateStationState(input: unknown): ValidationResult<StationState> {
	if (!isRecord(input)) {
		return fail('station.state payload must be an object');
	}

	const selectedExperienceId = readNullableSlug(input.selectedExperienceId);
	if (!selectedExperienceId.ok) {
		return selectedExperienceId;
	}

	const selectedLaunchClientId = readNullableString(
		input.selectedLaunchClientId,
		'station.state selectedLaunchClientId must be a non-empty string or null'
	);
	if (!selectedLaunchClientId.ok) {
		return selectedLaunchClientId;
	}

	return ok({
		selectedExperienceId: selectedExperienceId.value,
		selectedLaunchClientId: selectedLaunchClientId.value
	});
}

export function validateRuntimeClientsPayload(
	input: unknown
): ValidationResult<RuntimeClientsPayload> {
	if (!isRecord(input) || !Array.isArray(input.clients)) {
		return fail('runtime.clients payload must contain a clients array');
	}

	const selectedLaunchClientId = readNullableString(
		input.selectedLaunchClientId,
		'runtime.clients selectedLaunchClientId must be a non-empty string or null'
	);
	if (!selectedLaunchClientId.ok) {
		return selectedLaunchClientId;
	}

	const clients: RuntimeClientSummary[] = [];
	for (const client of input.clients) {
		const validation = readRuntimeClientSummary(client);
		if (!validation.ok) {
			return validation;
		}
		clients.push(validation.value);
	}

	return ok({ selectedLaunchClientId: selectedLaunchClientId.value, clients });
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

	if (input.controllerType !== 'm5') {
		return fail('control.orientation controllerType must be m5');
	}

	return ok({
		pitch: pitch.value,
		roll: roll.value,
		quality: quality.value,
		controllerType: input.controllerType
	});
}

function isNonEmptySlug(value: unknown): value is string {
	return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHostRuntimeMessageEnvelope(
	value: unknown
): value is Readonly<{ type: string; payload: unknown }> {
	return isRecord(value) && typeof value.type === 'string' && 'payload' in value;
}

function readValidatedMessage<TType extends HostRuntimeMessage['type'], TPayload>(
	type: TType,
	payload: unknown,
	validate: (input: unknown) => ValidationResult<TPayload>
): Readonly<{ type: TType; payload: TPayload }> | null {
	const validation = validate(payload);
	return validation.ok ? { type, payload: validation.value } : null;
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

	return ok(value.trim());
}

function readOptionalString(value: unknown, error: string): ValidationResult<string | undefined> {
	if (value === undefined) {
		return ok(undefined);
	}

	if (typeof value !== 'string') {
		return fail(error);
	}

	const trimmed = value.trim();
	return ok(trimmed === '' ? undefined : trimmed);
}

function readSlug(value: unknown, error: string): ValidationResult<string> {
	if (!isNonEmptySlug(value)) {
		return fail(error);
	}

	return ok(value);
}

function readNullableSlug(value: unknown): ValidationResult<string | null> {
	if (value === null) {
		return ok(null);
	}

	return readSlug(value, 'station.state selectedExperienceId must be a slug or null');
}

function readNullableString(value: unknown, error: string): ValidationResult<string | null> {
	if (value === null) {
		return ok(null);
	}

	return readString(value, error);
}

function readHttpsUrl(value: unknown, error: string): ValidationResult<string> {
	if (typeof value !== 'string') {
		return fail(error);
	}

	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') {
			return fail(error);
		}

		return ok(url.toString());
	} catch {
		return fail(error);
	}
}

function readRuntimeClientSummary(input: unknown): ValidationResult<RuntimeClientSummary> {
	if (!isRecord(input)) {
		return fail('runtime.clients client must be an object');
	}

	const clientId = readString(
		input.clientId,
		'runtime.clients clientId must be a non-empty string'
	);
	if (!clientId.ok) {
		return clientId;
	}

	const experienceId = readSlug(input.experienceId, 'runtime.clients experienceId must be a slug');
	if (!experienceId.ok) {
		return experienceId;
	}

	const title = readString(input.title, 'runtime.clients title must be a non-empty string');
	if (!title.ok) {
		return title;
	}

	const url = readHttpsUrl(input.url, 'runtime.clients url must be an https URL');
	if (!url.ok) {
		return url;
	}

	const userAgent = readOptionalString(
		input.userAgent,
		'runtime.clients userAgent must be a string'
	);
	if (!userAgent.ok) {
		return userAgent;
	}

	const connectedAt = readFiniteNumber(
		input.connectedAt,
		'runtime.clients connectedAt must be finite'
	);
	if (!connectedAt.ok) {
		return connectedAt;
	}

	const lastSeenAt = readFiniteNumber(
		input.lastSeenAt,
		'runtime.clients lastSeenAt must be finite'
	);
	if (!lastSeenAt.ok) {
		return lastSeenAt;
	}

	if (input.status !== 'online' && input.status !== 'stale') {
		return fail('runtime.clients status must be online or stale');
	}

	return ok({
		clientId: clientId.value,
		experienceId: experienceId.value,
		title: title.value,
		url: url.value,
		...(userAgent.value === undefined ? {} : { userAgent: userAgent.value }),
		connectedAt: connectedAt.value,
		lastSeenAt: lastSeenAt.value,
		status: input.status
	});
}

function readFiniteNumber(value: unknown, error: string): ValidationResult<number> {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fail(error);
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
