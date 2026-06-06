/**
 * Purpose: launch routing for externally hosted experience clients. The host
 * does not serve or start experience assets here; it only resolves the active
 * experience to a LAN-safe browser URL that Quest can open directly.
 */
import { isNonEmptySlug } from '$lib/protocol';
import { formatHost, resolveLanHostname } from '$lib/server/network';

const DEFAULT_EXPERIENCE_PORT = '5174';
const DEFAULT_EXPERIENCE_PATH = '/';
const HTTPS_EXPERIENCE_PROTOCOL = 'https';

export type ExperienceLaunchResult =
	| Readonly<{ ok: true; url: string }>
	| Readonly<{ ok: false; status: 400 | 409 | 500; message: string }>;

export function resolveExperienceLaunchUrl(
	activeExperienceId: string | null,
	requestUrl: URL
): ExperienceLaunchResult {
	if (activeExperienceId === null) {
		return fail(409, 'No active experience is selected.');
	}

	if (!isNonEmptySlug(activeExperienceId)) {
		return fail(400, 'Active experience id is invalid.');
	}

	const origin = resolveExperienceOrigin(requestUrl);

	if (!origin.ok) {
		return origin;
	}

	const path = resolveExperiencePath(activeExperienceId);

	if (!path.ok) {
		return path;
	}

	const target = new URL(path.value, origin.value);

	if (target.origin !== origin.value.origin) {
		return fail(500, 'ICAROS_EXPERIENCE_PATH must stay on the configured experience origin.');
	}

	return {
		ok: true,
		url: target.toString()
	};
}

function resolveExperienceOrigin(
	requestUrl: URL
): Readonly<{ ok: true; value: URL }> | Readonly<{ ok: false; status: 500; message: string }> {
	const configuredOrigin = readOptionalEnvironmentValue('ICAROS_EXPERIENCE_ORIGIN');

	if (configuredOrigin !== null) {
		return readExperienceOrigin(configuredOrigin);
	}

	const protocol = readOptionalEnvironmentValue('ICAROS_EXPERIENCE_PROTOCOL');
	const port = readOptionalEnvironmentValue('ICAROS_EXPERIENCE_PORT') ?? DEFAULT_EXPERIENCE_PORT;

	if (protocol === null) {
		return fail(
			500,
			'Quest launch requires an HTTPS experience target. Set ICAROS_EXPERIENCE_ORIGIN=https://... or ICAROS_EXPERIENCE_PROTOCOL=https.'
		);
	}

	if (protocol !== HTTPS_EXPERIENCE_PROTOCOL) {
		return fail(500, 'ICAROS_EXPERIENCE_PROTOCOL must be https for Quest launch.');
	}

	if (!isTcpPort(port)) {
		return fail(500, 'ICAROS_EXPERIENCE_PORT must be a TCP port number.');
	}

	const hostname = resolveLanHostname(requestUrl.hostname);
	return {
		ok: true,
		value: new URL(`${protocol}://${formatHost(hostname, port)}`)
	};
}

function readExperienceOrigin(
	origin: string
): Readonly<{ ok: true; value: URL }> | Readonly<{ ok: false; status: 500; message: string }> {
	try {
		const url = new URL(origin);

		if (url.protocol !== 'https:') {
			return fail(500, 'ICAROS_EXPERIENCE_ORIGIN must use https for Quest launch.');
		}

		if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
			return fail(500, 'ICAROS_EXPERIENCE_ORIGIN must not include a path, query, or hash.');
		}

		return { ok: true, value: url };
	} catch {
		return fail(500, 'ICAROS_EXPERIENCE_ORIGIN must be a valid URL.');
	}
}

function resolveExperiencePath(
	experienceId: string
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; status: 500; message: string }> {
	const pathTemplate =
		readOptionalEnvironmentValue('ICAROS_EXPERIENCE_PATH') ?? DEFAULT_EXPERIENCE_PATH;

	if (!pathTemplate.startsWith('/')) {
		return fail(500, 'ICAROS_EXPERIENCE_PATH must start with /.');
	}

	if (pathTemplate.startsWith('//')) {
		return fail(500, 'ICAROS_EXPERIENCE_PATH must start with a single /.');
	}

	return {
		ok: true,
		value: pathTemplate.replaceAll('{experienceId}', encodeURIComponent(experienceId))
	};
}

function fail<TStatus extends 400 | 409 | 500>(
	status: TStatus,
	message: string
): Readonly<{ ok: false; status: TStatus; message: string }> {
	return { ok: false, status, message };
}

function readOptionalEnvironmentValue(key: string): string | null {
	const value = process.env[key]?.trim();
	return value === undefined || value === '' ? null : value;
}

function isTcpPort(value: string): boolean {
	const parsed = Number(value);
	return /^\d{1,5}$/.test(value) && Number.isInteger(parsed) && parsed >= 1 && parsed <= 65_535;
}
