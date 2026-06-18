/**
 * Purpose: launch routing for selected runtime clients. The host does not serve
 * or start assets; it redirects Quest/browser devices to the concrete client
 * that the operator selected in the console.
 */
import type { RuntimeClientSummary, StationState } from '$lib/protocol';
import { setLaunchClientSelection } from '$lib/server/station/launch-selection';
import { stationStateStore } from '$lib/server/station/state';
import { runtimeClientRegistry } from '$lib/server/ws/runtime-clients';

export type LaunchClientResult =
	| Readonly<{ ok: true; url: string }>
	| Readonly<{ ok: false; status: 400 | 409 | 500; message: string }>;

export type LaunchSelectionResult =
	| Readonly<{ ok: true }>
	| Readonly<{ ok: false; status: 400; message: string }>;

export type LaunchRoutingState = Readonly<{
	station: StationState;
	target: LaunchClientResult;
}>;

export function readLaunchRoutingState(): LaunchRoutingState {
	const station = stationStateStore.getState();
	return {
		station,
		target: resolveLaunchClientUrl(station.selectedLaunchClientId, findSelectedClient(station))
	};
}

export function resolveSelectedLaunchClientUrl(): LaunchClientResult {
	return readLaunchRoutingState().target;
}

export function selectLaunchClient(clientId: string | null): LaunchSelectionResult {
	if (clientId === null) {
		setLaunchClientSelection(null, null);
		return { ok: true };
	}

	const client = runtimeClientRegistry.findSelectableClient(clientId);
	if (client === null) {
		return fail(400, 'Runtime client is not online.');
	}

	setLaunchClientSelection(client.clientId, client.experienceId);
	return { ok: true };
}

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

function findSelectedClient(station: StationState): RuntimeClientSummary | null {
	return station.selectedLaunchClientId === null
		? null
		: runtimeClientRegistry.findSelectableClient(station.selectedLaunchClientId);
}

function fail<TStatus extends 400 | 409 | 500>(
	status: TStatus,
	message: string
): Readonly<{ ok: false; status: TStatus; message: string }> {
	return { ok: false, status, message };
}
