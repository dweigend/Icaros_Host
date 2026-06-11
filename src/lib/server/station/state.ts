/**
 * Purpose: single-station state container for M1. It owns active runtime client
 * selection plus derived experience state; persistence and multi-session
 * behavior are intentionally out of scope.
 */
import { STATION_ID, type StationState } from '$lib/protocol';

type StationStateListener = (state: StationState) => void;

const STATION_STATE_STORE_KEY = '__icarosStationStateStore';

type IcarosGlobalState = typeof globalThis & {
	[STATION_STATE_STORE_KEY]?: StationStateStore;
};

class StationStateStore {
	#state: StationState = { activeExperienceId: null, activeClientId: null };
	#listeners = new Set<StationStateListener>();

	get stationId(): typeof STATION_ID {
		return STATION_ID;
	}

	getState(): StationState {
		return this.#state;
	}

	setLaunchSelection(
		activeClientId: string | null,
		activeExperienceId: string | null
	): StationState {
		if (
			this.#state.activeClientId === activeClientId &&
			this.#state.activeExperienceId === activeExperienceId
		) {
			return this.#state;
		}

		this.#state = { activeExperienceId, activeClientId };
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

const icarosGlobalState = globalThis as IcarosGlobalState;

export const stationStateStore =
	icarosGlobalState[STATION_STATE_STORE_KEY] ?? new StationStateStore();

icarosGlobalState[STATION_STATE_STORE_KEY] = stationStateStore;
