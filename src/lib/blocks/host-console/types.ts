/**
 * Purpose: public prop types for the composed host console block.
 */
import type { StationState } from '$lib/protocol';

export type UsbSetupSnapshot = Readonly<{
	state:
		| 'idle'
		| 'usb_connected'
		| 'firmware_check'
		| 'firmware_update'
		| 'configure'
		| 'usb_test'
		| 'wlan_test'
		| 'ready'
		| 'failed';
	step: string;
	progress: number;
	startedAt: number | null;
	finishedAt: number | null;
	serverUrl: string | null;
	deviceId: string | null;
	firmwareVersion: string | null;
	usbOk: boolean;
	wlanOk: boolean;
	lastFrameAt: number | null;
	message: string;
	error: string | null;
	exitCode: number | null;
	debugEnabled: boolean;
	debugLines: readonly PairingDebugLine[];
}>;

export type PairingDebugLine = Readonly<{
	id: number;
	timestamp: number;
	source: 'system' | 'script' | 'stderr' | 'event' | 'websocket';
	message: string;
}>;

export type HostConsoleConnection = Readonly<{
	httpOrigin: string;
	wsOrigin: string;
	questLaunchUrl: string;
	experienceTargetUrl: string | null;
	pairedDeviceUrl: string;
}>;

export type HostConsoleProps = Readonly<{
	connection: HostConsoleConnection;
	station: StationState;
	usbSetup: UsbSetupSnapshot;
}>;
