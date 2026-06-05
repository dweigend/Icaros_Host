/**
 * Purpose: Quest launch endpoint for the active experience. It redirects to an
 * externally running experience client instead of serving or starting assets in
 * the host process.
 */
import { error, redirect } from '@sveltejs/kit';

import { resolveExperienceLaunchUrl } from '$lib/server/experiences';
import { stationStateStore } from '$lib/server/station/state';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const result = resolveExperienceLaunchUrl(stationStateStore.getState().activeExperienceId, url);

	if (!result.ok) {
		error(result.status, result.message);
	}

	redirect(307, result.url);
};
