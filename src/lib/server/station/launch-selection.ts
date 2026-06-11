/**
 * Purpose: apply single-console launch client selection changes. The selected
 * launch client derives selectedExperienceId; standalone experience-id routing
 * is not exposed in the M1 station model.
 */
import { stationStateStore } from './state';

export function setLaunchClientSelection(
	selectedLaunchClientId: string | null,
	selectedExperienceId: string | null
): void {
	stationStateStore.setLaunchSelection(selectedLaunchClientId, selectedExperienceId);
}
