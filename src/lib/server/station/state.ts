/**
 * Purpose: single-station state container for M1. It owns active experience
 * selection and notifies subscribers; persistence and multi-session behavior are
 * intentionally out of scope.
 */
import { STATION_ID, type StationState } from '$lib/protocol';

export type StationStateListener = (state: StationState) => void;

export class StationStateStore {
	#state: StationState = { activeExperienceId: null };
	#listeners = new Set<StationStateListener>();

	get stationId(): typeof STATION_ID {
		return STATION_ID;
	}

	getState(): StationState {
		return this.#state;
	}

	setActiveExperience(activeExperienceId: string | null): StationState {
		if (this.#state.activeExperienceId === activeExperienceId) {
			return this.#state;
		}

		this.#state = { activeExperienceId };
		this.#emit();
		return this.#state;
	}

	subscribe(listener: StationStateListener): () => void {
		this.#listeners.add(listener);
		listener(this.#state);

		return () => {
			this.#listeners.delete(listener);
		};
	}

	#emit(): void {
		for (const listener of this.#listeners) {
			listener(this.#state);
		}
	}
}

export const stationStateStore = new StationStateStore();
