/**
 * Purpose: browser-side Public Control Stream state for the Host console.
 */
import type { StatusDotTone } from '$lib/components/status-dot';
import type { ControlOrientation } from '$lib/protocol';
import {
	createRuntimeDebugFrame,
	formatAge,
	parseControlStreamMessage,
	type RuntimeDebugFrame,
	type RuntimeDebugStatus,
	toQualityPercent,
	toUnitPercent
} from './runtime-debug';

const DEBUG_FRAME_LIMIT = 12;

export function createConsoleControlStreamState() {
	let debugNow = $state(Date.now());
	let debugStatus = $state<RuntimeDebugStatus>('disconnected');
	let debugLastMessageAt = $state<number | null>(null);
	let debugFrameCount = $state(0);
	let debugLastControl = $state<ControlOrientation | null>(null);
	let debugFrames = $state<RuntimeDebugFrame[]>([]);
	let controlStreamSocket: WebSocket | null = null;

	const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
	const debugLastMessageAge = $derived(
		debugLastMessageAt === null ? 'never' : formatAge(debugNow - debugLastMessageAt)
	);
	const debugPitchPercent = $derived(toUnitPercent(debugLastControl?.pitch ?? 0));
	const debugRollPercent = $derived(toUnitPercent(debugLastControl?.roll ?? 0));
	const debugQualityPercent = $derived(toQualityPercent(debugLastControl?.quality ?? 0));

	function tick(now: number): void {
		debugNow = now;
	}

	function mount(controlSocketUrl: string): () => void {
		controlStreamSocket = new WebSocket(controlSocketUrl);
		debugStatus = 'connecting';

		controlStreamSocket.onopen = () => {
			debugStatus = 'connected';
		};

		controlStreamSocket.onmessage = (event: MessageEvent) => {
			readControlStreamMessage(String(event.data));
		};

		controlStreamSocket.onerror = () => {
			debugStatus = 'error';
		};

		controlStreamSocket.onclose = () => {
			debugStatus = 'disconnected';
			controlStreamSocket = null;
		};

		return () => {
			controlStreamSocket?.close();
			controlStreamSocket = null;
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
		debugFrames = [
			createRuntimeDebugFrame(debugFrameCount, control, receivedAt),
			...debugFrames
		].slice(0, DEBUG_FRAME_LIMIT);
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

function readDebugStatusTone(status: RuntimeDebugStatus): StatusDotTone {
	if (status === 'connected') {
		return 'success';
	}

	if (status === 'connecting') {
		return 'warning';
	}

	if (status === 'error') {
		return 'danger';
	}

	return 'default';
}
