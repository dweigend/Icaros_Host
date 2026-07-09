/**
 * Purpose: route-local reactive facade for the single Icaros Host console page.
 * It composes server load data, browser sockets, and view-derived setup state.
 */
import { invalidateAll } from '$app/navigation';
import type { PageData } from '../$types';
import { createConsoleConnectionUrls } from './connection-urls';
import { createConsoleControlStreamState } from './control-stream-state.svelte';
import { isUsbSetupBusy, readControllerIndicators, readUsbSetupTone } from './controller-status';
import { formatAge } from './format';
import { createConsoleLaunchRegistryState } from './launch-registry-state.svelte';
import type {
	HostConsoleControllerSetupState,
	HostConsoleControlStreamPanelState,
	HostConsoleLaunchState,
	HostConsoleRuntimeRegistryState,
	HostConsoleState,
	HostConsoleUsbForm
} from './types';
import { createDefaultUsbForm, formatUsbSetupDuration } from './usb-setup-view';

const USB_SETUP_REFRESH_MS = 1_000;
const CONSOLE_CLOCK_MS = 250;

export function createConsolePageState(readData: () => PageData): HostConsoleState {
	let usbNow = $state(Date.now());
	const controlStream = createConsoleControlStreamState();
	const usbForm: HostConsoleUsbForm = $state(createDefaultUsbForm());

	const connection = $derived(readData().connection);
	const station = $derived(readData().station);
	const m5Calibration = $derived(readData().m5Calibration);
	const m5OrientationMap = $derived(readData().m5OrientationMap);
	const usbSetup = $derived(readData().usbSetup);
	const selectedLaunchClientId = $derived(station.selectedLaunchClientId);
	const launchRegistry = createConsoleLaunchRegistryState(() => selectedLaunchClientId);
	const connectionUrls = $derived(createConsoleConnectionUrls(connection));
	const launchClientOptions = $derived(
		launchRegistry.runtimeClients.map((client) => ({
			disabled: client.status !== 'online',
			label: `${client.title} - ${client.experienceId}`,
			value: client.clientId
		}))
	);
	const launchTargetUrl = $derived(
		resolveCurrentLaunchTargetUrl(
			launchRegistry.selectedLaunchClientId,
			launchRegistry.runtimeClients,
			connectionUrls.experienceTargetUrl
		)
	);
	const usbSetupTone = $derived(readUsbSetupTone(usbSetup, usbNow));
	const usbSetupDuration = $derived(
		formatUsbSetupDuration(usbSetup.startedAt, usbSetup.finishedAt, usbNow)
	);
	const usbSetupBusy = $derived(isUsbSetupBusy(usbSetup.state));
	const usbLastFrameAge = $derived(
		usbSetup.lastFrameAt === null ? 'never' : formatAge(usbNow - usbSetup.lastFrameAt)
	);
	const controllerIndicators = $derived(
		readControllerIndicators(usbSetup, usbLastFrameAge, usbNow)
	);

	$effect(() => {
		if (!isUsbSetupBusy(usbSetup.state) && usbSetup.state !== 'ready') {
			return;
		}

		const refresh = window.setInterval(() => {
			void invalidateAll();
		}, USB_SETUP_REFRESH_MS);

		return () => window.clearInterval(refresh);
	});

	function mountConsoleLiveSockets(): () => void {
		const cleanupControlStream = controlStream.mount(connectionUrls.controlSocketUrl);
		const cleanupLaunchRegistry = launchRegistry.mount(connectionUrls.runtimeSocketUrl);
		const clock = window.setInterval(tickConsoleClock, CONSOLE_CLOCK_MS);

		return () => {
			window.clearInterval(clock);
			cleanupControlStream();
			cleanupLaunchRegistry();
		};
	}

	function tickConsoleClock(): void {
		const now = Date.now();
		controlStream.tick(now);
		usbNow = now;
	}

	const launchState: HostConsoleLaunchState = {
		get selectedLaunchClientId() {
			return launchRegistry.selectedLaunchClientId;
		},
		get launchClientOptions() {
			return launchClientOptions;
		},
		get launchTargetUrl() {
			return launchTargetUrl;
		},
		get connectionUrls() {
			return connectionUrls;
		}
	};

	const registryState: HostConsoleRuntimeRegistryState = {
		get selectedLaunchClientId() {
			return launchRegistry.selectedLaunchClientId;
		},
		get runtimeClients() {
			return launchRegistry.runtimeClients;
		},
		get now() {
			return controlStream.debugNow;
		}
	};

	const controllerState: HostConsoleControllerSetupState = {
		usbForm,
		get usbSetup() {
			return usbSetup;
		},
		get usbSetupTone() {
			return usbSetupTone;
		},
		get usbSetupDuration() {
			return usbSetupDuration;
		},
		get usbSetupBusy() {
			return usbSetupBusy;
		},
		get usbLastFrameAge() {
			return usbLastFrameAge;
		},
		get controllerIndicators() {
			return controllerIndicators;
		}
	};

	const controlStreamPanelState: HostConsoleControlStreamPanelState = {
		get connectionUrls() {
			return connectionUrls;
		},
		get debugStatus() {
			return controlStream.debugStatus;
		},
		get debugStatusTone() {
			return controlStream.debugStatusTone;
		},
		get debugLastControl() {
			return controlStream.debugLastControl;
		},
		get debugFrames() {
			return controlStream.debugFrames;
		},
		get debugFrameCount() {
			return controlStream.debugFrameCount;
		},
		get debugLastMessageAge() {
			return controlStream.debugLastMessageAge;
		},
		get debugNow() {
			return controlStream.debugNow;
		},
		get debugPitchPercent() {
			return controlStream.debugPitchPercent;
		},
		get debugRollPercent() {
			return controlStream.debugRollPercent;
		},
		get debugQualityPercent() {
			return controlStream.debugQualityPercent;
		},
		get m5Calibration() {
			return m5Calibration;
		},
		get m5OrientationMap() {
			return m5OrientationMap;
		},
		get canCalibrateCurrentPose() {
			return (controlStream.debugLastControl?.quality ?? 0) > 0;
		}
	};

	return {
		mountConsoleLiveSockets,
		launch: launchState,
		registry: registryState,
		controller: controllerState,
		controlStream: controlStreamPanelState,
		get connectionUrls() {
			return connectionUrls;
		}
	};
}

function resolveCurrentLaunchTargetUrl(
	selectedLaunchClientId: string | null,
	runtimeClients: HostConsoleRuntimeRegistryState['runtimeClients'],
	fallbackTargetUrl: string | null
): string | null {
	if (selectedLaunchClientId === null) {
		return null;
	}

	const selectedClient = runtimeClients.find(
		(client) => client.clientId === selectedLaunchClientId
	);
	if (selectedClient === undefined) {
		return runtimeClients.length === 0 ? fallbackTargetUrl : null;
	}

	return selectedClient.status === 'online' ? readHttpsUrl(selectedClient.url) : null;
}

function readHttpsUrl(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' ? url.toString() : null;
	} catch {
		return null;
	}
}
