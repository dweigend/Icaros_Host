/**
 * Purpose: browser-side Launch Client Registry state for the Host console.
 */
import type { RuntimeClientSummary } from '$lib/protocol';
import { parseRuntimeRegistryMessage } from './runtime-debug';

export function createConsoleLaunchRegistryState(readServerActiveClientId: () => string | null) {
	let runtimeRegistryActiveClientId = $state<string | null | undefined>(undefined);
	let runtimeClients = $state<readonly RuntimeClientSummary[]>([]);
	let runtimeRegistrySocket: WebSocket | null = null;

	const activeClientId = $derived(
		runtimeRegistryActiveClientId === undefined
			? readServerActiveClientId()
			: runtimeRegistryActiveClientId
	);

	function mount(runtimeSocketUrl: string): () => void {
		runtimeRegistrySocket = new WebSocket(runtimeSocketUrl);

		runtimeRegistrySocket.onmessage = (event: MessageEvent) => {
			readRuntimeRegistryMessage(String(event.data));
		};

		runtimeRegistrySocket.onclose = () => {
			runtimeRegistrySocket = null;
		};

		return () => {
			runtimeRegistrySocket?.close();
			runtimeRegistrySocket = null;
		};
	}

	function readRuntimeRegistryMessage(data: string): void {
		const message = parseRuntimeRegistryMessage(data);

		if (message === null) {
			return;
		}

		if (message.type === 'station.state') {
			runtimeRegistryActiveClientId = message.payload.activeClientId;
			return;
		}

		runtimeClients = message.payload.clients;
	}

	return {
		mount,
		get activeClientId() {
			return activeClientId;
		},
		get runtimeClients() {
			return runtimeClients;
		}
	};
}
