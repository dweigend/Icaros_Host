/**
 * Purpose: validate operator/API active-experience changes against discovered
 * manifests before station state can redirect a Quest to an installed build.
 */
import { discoverExperiences } from '$lib/server/experiences';

import { stationStateStore } from './state';

export type SetActiveExperienceResult =
	| Readonly<{ ok: true; activeExperienceId: string | null }>
	| Readonly<{ ok: false; error: string }>;

export async function setValidatedActiveExperience(
	activeExperienceId: string | null
): Promise<SetActiveExperienceResult> {
	if (activeExperienceId === null) {
		stationStateStore.setActiveExperience(null);
		return { ok: true, activeExperienceId };
	}

	const discovery = await discoverExperiences();
	const exists = discovery.experiences.some((experience) => experience.id === activeExperienceId);

	if (!exists) {
		return {
			ok: false,
			error: `Experience is not installed or has no valid manifest: ${activeExperienceId}`
		};
	}

	stationStateStore.setActiveExperience(activeExperienceId);
	return { ok: true, activeExperienceId };
}
