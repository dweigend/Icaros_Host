/**
 * Purpose: launch routing for selected runtime clients. The host does not serve
 * or start assets; it redirects Quest/browser devices to the concrete client
 * that the operator selected in the console.
 */
import type { RuntimeClientSummary } from '$lib/protocol';

export type LaunchClientResult =
	| Readonly<{ ok: true; url: string }>
	| Readonly<{ ok: false; status: 400 | 409 | 500; message: string }>;

export function resolveLaunchClientUrl(
	selectedLaunchClientId: string | null,
	selectedClient: RuntimeClientSummary | null
): LaunchClientResult {
	if (selectedLaunchClientId === null) {
		return fail(409, 'No launch client is selected.');
	}

	if (selectedClient === null || selectedClient.status !== 'online') {
		return fail(409, 'The selected launch client is not online.');
	}

	try {
		const target = new URL(selectedClient.url);

		if (target.protocol !== 'https:') {
			return fail(500, 'Selected launch client URL must use https for Quest launch.');
		}

		return { ok: true, url: target.toString() };
	} catch {
		return fail(500, 'Selected launch client URL must be a valid HTTPS URL.');
	}
}

function fail<TStatus extends 400 | 409 | 500>(
	status: TStatus,
	message: string
): Readonly<{ ok: false; status: TStatus; message: string }> {
	return { ok: false, status, message };
}
