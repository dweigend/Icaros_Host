<!--
	Purpose: route-private status and bounded debug output for M5 pairing.
	Runtime state is provided by the Host console page facade.
-->
<script lang="ts">
	import { Kbd, ScrollArea } from '$lib/components';
	import type { HostConsoleControllerSetupState } from '../types';

	type Props = Readonly<{
		state: HostConsoleControllerSetupState;
	}>;

	let { state }: Props = $props();
</script>

<div class="stack" aria-label="M5 pairing status">
	<progress class="progress" max="100" value={state.usbSetup.progress} aria-label="Pairing progress">
		{state.usbSetup.progress}%
	</progress>
	<p><strong>{state.usbSetup.step}</strong> // {state.usbSetup.progress}%</p>
	<p>{state.usbSetup.error ?? state.usbSetup.message}</p>

	{#if state.usbSetup.debugEnabled}
		<p>
			Debug aktiv. Snapshot für LLMs: <Kbd>.icaros/debug/m5-pairing-debug.json</Kbd>
		</p>
		<ScrollArea class="log" aria-label="M5 pairing debug lines">
			{#each state.usbSetup.debugLines as line (line.id)}
				<div class="log-row pairing" data-source={line.source}>
					<span>{new Date(line.timestamp).toLocaleTimeString()}</span>
					<code>{line.source}</code>
					<span>{line.message}</span>
				</div>
			{:else}
				<p>Noch keine Debug-Ereignisse.</p>
			{/each}
		</ScrollArea>
	{/if}
</div>
