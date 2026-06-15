/**
 * Purpose: Quest launch endpoint for the selected runtime client. It redirects
 * instead of serving or starting assets in the host process.
 */
import { error, redirect } from '@sveltejs/kit';

import { resolveLaunchClientUrl } from '$lib/server/launch';
import { stationStateStore } from '$lib/server/station/state';
import { runtimeClientRegistry } from '$lib/server/ws/runtime-clients';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const station = stationStateStore.getState();
	const selectedClient =
		station.selectedLaunchClientId === null
			? null
			: runtimeClientRegistry.findSelectableClient(station.selectedLaunchClientId);
	const result = resolveLaunchClientUrl(station.selectedLaunchClientId, selectedClient);

	if (!result.ok) {
		error(result.status, result.message);
	}

	redirect(307, result.url);
};
