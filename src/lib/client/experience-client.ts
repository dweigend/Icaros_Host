/**
 * Purpose: compatibility facade for student experiences. It composes the public
 * control stream client with optional launch registration.
 */
import type { StationState } from '$lib/protocol';
import { readHttpsConsoleUrl } from './browser-socket-url';
import {
	type ControlStreamClientOptions,
	createIcarosControlStreamClient,
	type IcarosControlStreamClient,
	type OrientationListener
} from './control-stream-client';
import {
	createIcarosLaunchRegistrationClient,
	type IcarosLaunchRegistrationClient,
	type LaunchRegistrationClientOptions
} from './launch-registration-client';

export {
	createIcarosControlStreamClient,
	DEFAULT_CONTROL_STREAM_ID
} from './control-stream-client';
export { createIcarosLaunchRegistrationClient } from './launch-registration-client';
export type {
	ControlStreamClientOptions,
	IcarosControlStreamClient,
	IcarosLaunchRegistrationClient,
	LaunchRegistrationClientOptions,
	OrientationListener
};

export type ExperienceClientOptions = LaunchRegistrationClientOptions &
	Pick<ControlStreamClientOptions, 'streamId' | 'controlPath'>;

export class IcarosExperienceClient {
	#options: ExperienceClientOptions;
	#controlClient: IcarosControlStreamClient;
	#launchClient: IcarosLaunchRegistrationClient;
	#unsubscribeStationState: (() => void) | null = null;

	constructor(options: ExperienceClientOptions) {
		this.#options = options;
		this.#controlClient = createIcarosControlStreamClient(createControlOptions(options));
		this.#launchClient = createIcarosLaunchRegistrationClient(options);
	}

	start(): void {
		this.#controlClient.start();
		this.#launchClient.start();
		this.#unsubscribeStationState ??= this.#launchClient.onStationState((state) =>
			this.#handleStationState(state)
		);
	}

	dispose(): void {
		this.#unsubscribeStationState?.();
		this.#unsubscribeStationState = null;
		this.#controlClient.dispose();
		this.#launchClient.dispose();
	}

	onOrientation(listener: OrientationListener): () => void {
		return this.#controlClient.onOrientation(listener);
	}

	#handleStationState(state: StationState): void {
		if (state.activeExperienceId === this.#options.experienceId) {
			return;
		}

		const consoleUrl = readHttpsConsoleUrl(this.#options.hostOrigin ?? this.#options.runtimeOrigin);
		if (consoleUrl.href !== window.location.href) {
			window.location.assign(consoleUrl.href);
		}
	}
}

export function createIcarosExperienceClient(
	options: ExperienceClientOptions
): IcarosExperienceClient {
	return new IcarosExperienceClient(options);
}

function createControlOptions(options: ExperienceClientOptions): ControlStreamClientOptions {
	if (options.hostOrigin !== undefined) {
		return {
			hostOrigin: options.hostOrigin,
			streamId: options.streamId,
			controlPath: options.controlPath
		};
	}

	return {
		controlOrigin: options.runtimeOrigin,
		streamId: options.streamId,
		controlPath: options.controlPath
	};
}
