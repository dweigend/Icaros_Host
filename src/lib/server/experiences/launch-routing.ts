/**
 * Purpose: launch routing for externally hosted experience clients. The host
 * does not serve or start experience assets here; it only resolves the active
 * experience to a LAN-safe browser URL that Quest can open directly.
 */
import { isNonEmptySlug } from '$lib/protocol';
import { formatHost, readHttpProtocol, resolveLanHostname } from '$lib/server/network';

const DEFAULT_EXPERIENCE_PORT = '5174';
const DEFAULT_EXPERIENCE_PATH = '/';

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

	return {
		ok: true,
		url: new URL(path.value, origin.value).toString()
	};
}

function resolveExperienceOrigin(
	requestUrl: URL
): Readonly<{ ok: true; value: URL }> | Readonly<{ ok: false; status: 500; message: string }> {
	const configuredOrigin = process.env.ICAROS_EXPERIENCE_ORIGIN;

	if (configuredOrigin !== undefined) {
		return readExperienceOrigin(configuredOrigin);
	}

	const protocol = process.env.ICAROS_EXPERIENCE_PROTOCOL ?? readHttpProtocol(requestUrl.protocol);
	const port = process.env.ICAROS_EXPERIENCE_PORT ?? DEFAULT_EXPERIENCE_PORT;

	if (protocol !== 'http' && protocol !== 'https') {
		return fail(500, 'ICAROS_EXPERIENCE_PROTOCOL must be http or https.');
	}

	if (!/^\d{1,5}$/.test(port)) {
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

		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return fail(500, 'ICAROS_EXPERIENCE_ORIGIN must use http or https.');
		}

		return { ok: true, value: url };
	} catch {
		return fail(500, 'ICAROS_EXPERIENCE_ORIGIN must be a valid URL.');
	}
}

function resolveExperiencePath(
	experienceId: string
): Readonly<{ ok: true; value: string }> | Readonly<{ ok: false; status: 500; message: string }> {
	const pathTemplate = process.env.ICAROS_EXPERIENCE_PATH ?? DEFAULT_EXPERIENCE_PATH;

	if (!pathTemplate.startsWith('/')) {
		return fail(500, 'ICAROS_EXPERIENCE_PATH must start with /.');
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
