/**
 * Purpose: server-side data and actions for the single Icaros Host console.
 * The page updates the one M1 station state and exposes launch URLs without
 * owning experience assets.
 */
import { fail } from '@sveltejs/kit';

import { isNonEmptySlug } from '$lib/protocol';
import { resolveExperienceLaunchUrl } from '$lib/server/experiences';
import { resolveConnectionInfo } from '$lib/server/network';
import { setActiveExperience } from '$lib/server/station/active-experience';
import { stationStateStore } from '$lib/server/station/state';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const station = stationStateStore.getState();
	const connection = resolveConnectionInfo(url);
	const launchTarget = resolveExperienceLaunchUrl(station.activeExperienceId, url);

	return {
		connection: {
			...connection,
			questLaunchUrl: new URL('/launch', connection.httpOrigin).toString(),
			experienceTargetUrl: launchTarget.ok ? launchTarget.url : null
		},
		station
	};
};

export const actions: Actions = {
	setActive: async ({ request }) => {
		const formData = await request.formData();
		const rawExperienceId = formData.get('experienceId');
		const activeExperienceId = rawExperienceId === '' ? null : rawExperienceId;

		if (activeExperienceId !== null && !isNonEmptySlug(activeExperienceId)) {
			return fail(400, { message: 'Invalid experience id.' });
		}

		const result = setActiveExperience(activeExperienceId);

		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	}
};
