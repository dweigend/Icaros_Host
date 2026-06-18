/**
 * Purpose: browser-side Launch Client Registry state for the Host console. It
 * tracks selected runtime client and registered client presence from /ws/runtime.
 */
import type { RuntimeClientSummary } from '$lib/protocol';
import { parseRuntimeRegistryMessage } from './runtime-messages';

export function createConsoleLaunchRegistryState(
	readServerSelectedLaunchClientId: () => string | null
) {
	let registrySelectedLaunchClientId = $state<string | null | undefined>(undefined);
	let runtimeClients = $state<readonly RuntimeClientSummary[]>([]);
	let runtimeRegistrySocket: WebSocket | null = null;

	const selectedLaunchClientId = $derived(
		registrySelectedLaunchClientId === undefined
			? readServerSelectedLaunchClientId()
			: registrySelectedLaunchClientId
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
			registrySelectedLaunchClientId = message.payload.selectedLaunchClientId;
			return;
		}

		runtimeClients = message.payload.clients;
	}

	return {
		mount,
		get selectedLaunchClientId() {
			return selectedLaunchClientId;
		},
		get runtimeClients() {
			return runtimeClients;
		}
	};
}
