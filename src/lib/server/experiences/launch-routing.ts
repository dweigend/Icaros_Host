/**
 * Purpose: launch routing for registered experience clients. The host does not
 * serve or start experience assets; it redirects Quest/browser devices to the
 * concrete runtime client that the operator selected in the console.
 */
import type { RuntimeClientSummary } from '$lib/protocol';

export type ExperienceLaunchResult =
	| Readonly<{ ok: true; url: string }>
	| Readonly<{ ok: false; status: 400 | 409 | 500; message: string }>;

export function resolveExperienceLaunchUrl(
	activeClientId: string | null,
	activeClient: RuntimeClientSummary | null
): ExperienceLaunchResult {
	if (activeClientId === null) {
		return fail(409, 'No active runtime client is selected.');
	}

	if (activeClient === null || activeClient.status !== 'online') {
		return fail(409, 'The active runtime client is not online.');
	}

	try {
		const target = new URL(activeClient.url);

		if (target.protocol !== 'https:') {
			return fail(500, 'Active runtime client URL must use https for Quest launch.');
		}

		return { ok: true, url: target.toString() };
	} catch {
		return fail(500, 'Active runtime client URL must be a valid HTTPS URL.');
	}
}

function fail<TStatus extends 400 | 409 | 500>(
	status: TStatus,
	message: string
): Readonly<{ ok: false; status: TStatus; message: string }> {
	return { ok: false, status, message };
}
