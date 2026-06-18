/**
 * Purpose: browser-side Public Control Stream state for the Host console. It
 * subscribes to normalized control messages and keeps bounded debug history.
 */
import type { StatusDotTone } from '$lib/components/status-dot';
import type { ControlOrientation } from '$lib/protocol';
import { formatAge, toQualityPercent, toUnitPercent } from './format';
import { parseControlStreamMessage } from './runtime-messages';
import type { HostConsoleDebugFrame, HostConsoleDebugStatus } from './types';

const DEBUG_FRAME_LIMIT = 12;

export function createConsoleControlStreamState() {
	let debugNow = $state(Date.now());
	let debugStatus = $state<HostConsoleDebugStatus>('disconnected');
	let debugLastMessageAt = $state<number | null>(null);
	let debugFrameCount = $state(0);
	let debugLastControl = $state<ControlOrientation | null>(null);
	let debugFrames = $state<HostConsoleDebugFrame[]>([]);
	let cleanupControlStreamSocket: (() => void) | null = null;

	const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
	const debugLastMessageAge = $derived(readLastMessageAge(debugLastMessageAt, debugNow));
	const debugPitchPercent = $derived(toUnitPercent(debugLastControl?.pitch ?? 0));
	const debugRollPercent = $derived(toUnitPercent(debugLastControl?.roll ?? 0));
	const debugQualityPercent = $derived(toQualityPercent(debugLastControl?.quality ?? 0));

	function tick(now: number): void {
		debugNow = now;
	}

	function mount(controlSocketUrl: string): () => void {
		cleanupControlStreamSocket = closeSocket(cleanupControlStreamSocket);
		debugStatus = 'connecting';

		let cleanupSocket: (() => void) | null = null;
		const socket = new WebSocket(controlSocketUrl);
		socket.onopen = () => {
			debugStatus = 'connected';
		};
		socket.onmessage = (event: MessageEvent) => readControlStreamMessage(String(event.data));
		socket.onerror = () => {
			debugStatus = 'error';
		};
		socket.onclose = () => {
			debugStatus = 'disconnected';
			if (cleanupControlStreamSocket === cleanupSocket) {
				cleanupControlStreamSocket = null;
			}
		};

		cleanupSocket = () => socket.close();
		cleanupControlStreamSocket = cleanupSocket;

		return () => {
			cleanupControlStreamSocket = closeSocket(cleanupControlStreamSocket);
		};
	}

	function readControlStreamMessage(data: string): void {
		const control = parseControlStreamMessage(data);
		if (control === null) {
			return;
		}

		const receivedAt = Date.now();
		debugLastMessageAt = receivedAt;
		debugLastControl = control;
		debugFrameCount += 1;
		debugFrames = [createDebugFrame(debugFrameCount, control, receivedAt), ...debugFrames].slice(
			0,
			DEBUG_FRAME_LIMIT
		);
	}

	return {
		mount,
		tick,
		get debugStatus() {
			return debugStatus;
		},
		get debugStatusTone() {
			return debugStatusTone;
		},
		get debugLastControl() {
			return debugLastControl;
		},
		get debugFrames() {
			return debugFrames;
		},
		get debugFrameCount() {
			return debugFrameCount;
		},
		get debugLastMessageAge() {
			return debugLastMessageAge;
		},
		get debugNow() {
			return debugNow;
		},
		get debugPitchPercent() {
			return debugPitchPercent;
		},
		get debugRollPercent() {
			return debugRollPercent;
		},
		get debugQualityPercent() {
			return debugQualityPercent;
		}
	};
}

function createDebugFrame(
	id: number,
	control: ControlOrientation,
	receivedAt: number
): HostConsoleDebugFrame {
	return {
		id,
		receivedAt,
		pitch: control.pitch,
		roll: control.roll,
		quality: control.quality,
		controllerType: control.controllerType
	};
}

function closeSocket(cleanup: (() => void) | null): null {
	cleanup?.();
	return null;
}

function readLastMessageAge(lastMessageAt: number | null, now: number): string {
	if (lastMessageAt === null) {
		return 'never';
	}

	return formatAge(now - lastMessageAt);
}

function readDebugStatusTone(status: HostConsoleDebugStatus): StatusDotTone {
	if (status === 'connected') {
		return 'success';
	}

	if (status === 'connecting') {
		return 'warning';
	}

	return status === 'error' ? 'danger' : 'default';
}
