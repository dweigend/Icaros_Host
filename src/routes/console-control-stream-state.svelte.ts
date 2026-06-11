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

type ControlStreamSocketHandlers = Readonly<{
	opened(): void;
	received(data: string): void;
	failed(): void;
	closed(): void;
}>;

export function createConsoleControlStreamState() {
	let debugNow = $state(Date.now());
	let debugStatus = $state<RuntimeDebugStatus>('disconnected');
	let debugLastMessageAt = $state<number | null>(null);
	let debugFrameCount = $state(0);
	let debugLastControl = $state<ControlOrientation | null>(null);
	let debugFrames = $state<RuntimeDebugFrame[]>([]);
	let cleanupControlStreamSocket: (() => void) | null = null;

	const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
	const debugLastMessageAge = $derived(readLastMessageAge(debugLastMessageAt, debugNow));
	const debugPitchPercent = $derived(readControlPitchPercent(debugLastControl));
	const debugRollPercent = $derived(readControlRollPercent(debugLastControl));
	const debugQualityPercent = $derived(readControlQualityPercent(debugLastControl));

	function tick(now: number): void {
		debugNow = now;
	}

	function mount(controlSocketUrl: string): () => void {
		cleanupControlStreamSocket = closeControlStreamSocket(cleanupControlStreamSocket);
		debugStatus = 'connecting';
		let cleanupSocket: (() => void) | null = null;
		cleanupSocket = connectControlStreamSocket(controlSocketUrl, {
			opened: () => {
				debugStatus = 'connected';
			},
			received: readControlStreamMessage,
			failed: () => {
				debugStatus = 'error';
			},
			closed: () => {
				debugStatus = 'disconnected';
				if (cleanupControlStreamSocket === cleanupSocket) {
					cleanupControlStreamSocket = null;
				}
			}
		});
		cleanupControlStreamSocket = cleanupSocket;

		return () => {
			cleanupControlStreamSocket = closeControlStreamSocket(cleanupControlStreamSocket);
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

function closeControlStreamSocket(cleanup: (() => void) | null): null {
	cleanup?.();
	return null;
}

function connectControlStreamSocket(
	controlSocketUrl: string,
	handlers: ControlStreamSocketHandlers
): () => void {
	const socket = new WebSocket(controlSocketUrl);
	socket.onopen = handlers.opened;
	socket.onmessage = (event: MessageEvent) => handlers.received(String(event.data));
	socket.onerror = handlers.failed;
	socket.onclose = handlers.closed;
	return () => socket.close();
}

function readLastMessageAge(lastMessageAt: number | null, now: number): string {
	if (lastMessageAt === null) {
		return 'never';
	}

	return formatAge(now - lastMessageAt);
}

function readControlPitchPercent(control: ControlOrientation | null): number {
	return toUnitPercent(control?.pitch ?? 0);
}

function readControlRollPercent(control: ControlOrientation | null): number {
	return toUnitPercent(control?.roll ?? 0);
}

function readControlQualityPercent(control: ControlOrientation | null): number {
	return toQualityPercent(control?.quality ?? 0);
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
