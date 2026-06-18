<!--
	Purpose: route-private shell for M5 controller setup. Focused child panels own
	checklist, actions, pairing form, and debug status rendering.
-->
<script lang="ts">
	import { StatusDot, Switch } from '$lib/components';
	import ControllerIndicatorsList from './controller-indicators-list.svelte';
	import ControllerPairingForm from './controller-pairing-form.svelte';
	import ControllerPairingStatus from './controller-pairing-status.svelte';
	import ControllerWorkflowActions from './controller-workflow-actions.svelte';
	import type { HostConsoleControllerSetupState } from '../types';

	type Props = Readonly<{
		state: HostConsoleControllerSetupState;
	}>;

	let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="usb-title">
	<div class="row">
		<h2 id="usb-title">Controller einrichten</h2>
		<div class="status">
			<StatusDot tone={state.usbSetupTone} label={`USB setup ${state.usbSetup.state}`} />
			<span>{state.usbSetup.state}</span>
		</div>
		<form method="POST" action="?/setPairingDebug">
			<input type="hidden" name="enabled" value={state.usbSetup.debugEnabled ? 'false' : 'true'} />
			<Switch
				checked={state.usbSetup.debugEnabled}
				label="Debug"
				description={state.usbSetup.debugEnabled ? 'Ein' : 'Aus'}
				onclick={(event) => event.currentTarget.closest('form')?.requestSubmit()}
			/>
		</form>
	</div>

	<p>
		Laufzeit: {state.usbSetupDuration}
		{#if state.usbSetup.exitCode !== null}
			// exit {state.usbSetup.exitCode}
		{/if}
	</p>

	<ControllerIndicatorsList indicators={state.controllerIndicators} />
	<ControllerWorkflowActions {state} />
	<ControllerPairingForm {state} />
	<ControllerPairingStatus {state} />
</section>
