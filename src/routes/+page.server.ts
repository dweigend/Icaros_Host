/**
 * Purpose: server-side data and actions for the single Icaros Host console.
 * The page reads installed experience manifests and updates the one M1 station
 * state without adding separate UI routes or API endpoints.
 */
import { fail } from '@sveltejs/kit';

import { isNonEmptySlug } from '$lib/protocol';
import { discoverExperiences } from '$lib/server/experiences';
import { setValidatedActiveExperience } from '$lib/server/station/active-experience';
import { stationStateStore } from '$lib/server/station/state';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const discovery = await discoverExperiences();

	return {
		discovery,
		station: stationStateStore.getState()
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

		const result = await setValidatedActiveExperience(activeExperienceId);

		if (!result.ok) {
			return fail(400, { message: result.error });
		}

		return { ok: true };
	}
};
