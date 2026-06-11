/**
 * Purpose: apply single-console launch client selection changes. The selected
 * launch client derives activeExperienceId; standalone experience-id routing
 * is not exposed in the M1 station model.
 */
import { stationStateStore } from './state';

export function setLaunchClientSelection(
	activeClientId: string | null,
	activeExperienceId: string | null
): void {
	stationStateStore.setLaunchSelection(activeClientId, activeExperienceId);
}
