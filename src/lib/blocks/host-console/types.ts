/**
 * Purpose: structural data contract consumed by Host console blocks. The route
 * owns state creation; blocks only declare the view data they need.
 */
import type { StatusDotTone } from '$lib/components/status-dot';
import type { ControlOrientation, RuntimeClientSummary } from '$lib/protocol';

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

export type HostConsoleUsbForm = {
	ssid: string;
	password: string;
	deviceId: string;
	staticIp: string;
	gateway: string;
	subnet: string;
	dns: string;
};

export type HostConsoleState = Readonly<{
	mountConsoleLiveSockets(): () => void;
	selectedLaunchClientId: string | null;
	runtimeClients: readonly RuntimeClientSummary[];
	connectionUrls: HostConsoleConnectionUrls;
	usbForm: HostConsoleUsbForm;
	usbSetup: {
		state: string;
		debugEnabled: boolean;
		exitCode: number | null;
		canFlashFirmware: boolean;
		usbConnected: boolean;
		canConfigure: boolean;
		progress: number;
		step: string;
		error: string | null;
		message: string;
		debugLines: readonly {
			id: number;
			timestamp: number;
			source: string;
			message: string;
		}[];
	};
	usbSetupTone: StatusDotTone;
	usbSetupDuration: string;
	usbSetupBusy: boolean;
	usbLastFrameAge: string;
	controllerIndicators: readonly HostConsoleControllerIndicator[];
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
