/**
 * Purpose: apply single-console active-experience changes. Experience clients
 * register over `/ws/runtime` with the same id; local build discovery is not a
 * runtime requirement for routing controls.
 */
import { stationStateStore } from './state';

export type SetActiveExperienceResult =
	| Readonly<{ ok: true; activeExperienceId: string | null }>
	| Readonly<{ ok: false; error: string }>;

export function setActiveExperience(activeExperienceId: string | null): SetActiveExperienceResult {
	stationStateStore.setActiveExperience(activeExperienceId);
	return { ok: true, activeExperienceId };
}

export function setActiveClient(
	activeClientId: string | null,
	activeExperienceId: string | null
): void {
	stationStateStore.setActiveClient(activeClientId, activeExperienceId);
}
