/**
 * Purpose: route-private Host console contracts shared by the page, panels, and
 * browser-side state modules. These types are not a reusable library API.
 */
import type { StatusDotTone } from '$lib/components/status-dot';
import type { ControlOrientation, RuntimeClientSummary } from '$lib/protocol';
import type { PageData } from '../$types';

export type HostConsoleConnectionUrls = Readonly<{
	consoleUrl: string;
	questLaunchUrl: string;
	experienceTargetUrl: string | null;
	m5SocketUrl: string;
	controlSocketUrl: string;
	runtimeSocketUrl: string;
}>;

export type HostConsoleDebugStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export type HostConsoleDebugFrame = Readonly<{
	id: number;
	receivedAt: number;
	pitch: number;
	roll: number;
	quality: number;
	safeMode: boolean;
}>;

export type HostConsoleControllerIndicator = Readonly<{
	label: string;
	value: string;
	tone: StatusDotTone;
	detail: string;
}>;

export type HostConsoleLaunchClientOption = Readonly<{
	value: string;
	label: string;
	disabled?: boolean;
}>;

export type HostConsoleUsbForm = {
	ssid: string;
	password: string;
	deviceId: string;
	staticIp: string;
	gateway: string;
	subnet: string;
	dns: string;
};

export type HostConsoleUsbSetup = PageData['usbSetup'];
export type HostConsoleUsbSetupState = PageData['usbSetup']['state'];

export type HostConsoleLaunchState = Readonly<{
	selectedLaunchClientId: string | null;
	launchClientOptions: readonly HostConsoleLaunchClientOption[];
	connectionUrls: HostConsoleConnectionUrls;
}>;

export type HostConsoleRuntimeRegistryState = Readonly<{
	selectedLaunchClientId: string | null;
	runtimeClients: readonly RuntimeClientSummary[];
	now: number;
}>;

export type HostConsoleControllerSetupState = Readonly<{
	usbForm: HostConsoleUsbForm;
	usbSetup: HostConsoleUsbSetup;
	usbSetupTone: StatusDotTone;
	usbSetupDuration: string;
	usbSetupBusy: boolean;
	usbLastFrameAge: string;
	controllerIndicators: readonly HostConsoleControllerIndicator[];
}>;

export type HostConsoleControlStreamPanelState = Readonly<{
	connectionUrls: HostConsoleConnectionUrls;
	debugStatus: HostConsoleDebugStatus;
	debugStatusTone: StatusDotTone;
	debugLastControl: ControlOrientation | null;
	debugFrames: readonly HostConsoleDebugFrame[];
	debugFrameCount: number;
	debugLastMessageAge: string;
	debugNow: number;
	debugPitchPercent: number;
	debugRollPercent: number;
	debugQualityPercent: number;
}>;

export type HostConsoleState = Readonly<{
	mountConsoleLiveSockets(): () => void;
	connectionUrls: HostConsoleConnectionUrls;
	launch: HostConsoleLaunchState;
	registry: HostConsoleRuntimeRegistryState;
	controller: HostConsoleControllerSetupState;
	controlStream: HostConsoleControlStreamPanelState;
}>;
