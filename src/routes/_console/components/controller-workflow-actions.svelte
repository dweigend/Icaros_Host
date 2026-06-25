<!--
	Purpose: route-private action row for M5 USB probe, firmware flash, and
	abort workflows. Forms submit to route server actions.
-->
<script lang="ts">
	import { PlugZap, Search, Upload, XCircle } from '@lucide/svelte';

	import { Button } from '$lib/components';
	import type { HostConsoleControllerSetupState } from '../types';

	type Props = Readonly<{
		state: HostConsoleControllerSetupState;
	}>;

	let { state }: Props = $props();

	const pairingDisabled = $derived(
		state.usbSetupBusy ||
			!state.usbSetup.canConfigure ||
			state.usbForm.ssid.trim() === '' ||
			state.usbForm.password === ''
	);
</script>

<div class="actions">
	<form method="POST" action="?/probeUsbController">
		<Button type="submit" disabled={state.usbSetupBusy}>
			<Search size={16} aria-hidden="true" />
			USB prüfen
		</Button>
	</form>
	<form method="POST" action="?/flashM5Firmware">
		<Button type="submit" disabled={state.usbSetupBusy}>
			<Upload size={16} aria-hidden="true" />
			Firmware aktualisieren
		</Button>
	</form>
	<Button type="submit" form="controller-pairing-form" variant="primary" disabled={pairingDisabled}>
		<PlugZap size={16} aria-hidden="true" />
		{state.usbSetupBusy ? 'Läuft' : 'Pairing'}
	</Button>
	{#if state.usbSetupBusy}
		<form method="POST" action="?/abortUsbWorkflow">
			<Button type="submit">
				<XCircle size={16} aria-hidden="true" />
				Abbrechen
			</Button>
		</form>
	{/if}
</div>
