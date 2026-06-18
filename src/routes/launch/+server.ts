/**
 * Purpose: Quest launch endpoint for the selected runtime client. It redirects
 * instead of serving or starting assets in the host process.
 */
import { error, redirect } from '@sveltejs/kit';

import { resolveSelectedLaunchClientUrl } from '$lib/server/launch';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	const result = resolveSelectedLaunchClientUrl();

	if (!result.ok) {
		error(result.status, result.message);
	}

	redirect(307, result.url);
};
