/**
 * Purpose: compatibility facade for student experiences. It composes the public
 * control stream client with launch registration.
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

export { createIcarosControlStreamClient } from './control-stream-client';
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

export type IcarosExperienceClient = Readonly<{
	start(): void;
	dispose(): void;
	onOrientation(listener: OrientationListener): () => void;
}>;

export function createIcarosExperienceClient(
	options: ExperienceClientOptions
): IcarosExperienceClient {
	const controlClient = createIcarosControlStreamClient(createControlOptions(options));
	const launchClient = createIcarosLaunchRegistrationClient(options);
	let unsubscribeStationState: (() => void) | null = null;

	function handleStationState(state: StationState): void {
		if (state.activeExperienceId === options.experienceId) {
			return;
		}

		const consoleUrl = readHttpsConsoleUrl(options.hostOrigin ?? options.runtimeOrigin);
		if (consoleUrl.href !== window.location.href) {
			window.location.assign(consoleUrl.href);
		}
	}

	return {
		start(): void {
			controlClient.start();
			launchClient.start();
			unsubscribeStationState ??= launchClient.onStationState(handleStationState);
		},
		dispose(): void {
			unsubscribeStationState?.();
			unsubscribeStationState = null;
			controlClient.dispose();
			launchClient.dispose();
		},
		onOrientation(listener: OrientationListener): () => void {
			return controlClient.onOrientation(listener);
		}
	};
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
