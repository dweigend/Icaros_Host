/**
 * Purpose: apply single-console active runtime client changes. The selected
 * client derives activeExperienceId; standalone experience-id routing is not
 * exposed in the M1 station model.
 */
import { stationStateStore } from './state';

export function setActiveClient(
	activeClientId: string | null,
	activeExperienceId: string | null
): void {
	stationStateStore.setActiveClient(activeClientId, activeExperienceId);
}
