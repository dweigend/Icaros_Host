<!--
	Purpose: route-private M5 WiFi and device setup form. It only collects
	operator input; pairing execution belongs to route server actions.
-->
<script lang="ts">
	import type { HostConsoleControllerSetupState, HostConsoleUsbForm } from '../types';

	type PairingField = Readonly<{
		name: keyof HostConsoleUsbForm;
		label: string;
		inputmode?: 'decimal';
		placeholder?: string;
	}>;

	type Props = Readonly<{
		state: HostConsoleControllerSetupState;
	}>;

	let { state }: Props = $props();

	const pairingFields: readonly PairingField[] = [
		{ name: 'ssid', label: 'WiFi' },
		{ name: 'password', label: 'Passwort' },
		{ name: 'deviceId', label: 'Controller ID' }
	];
</script>

<form id="controller-pairing-form" class="stack" method="POST" action="?/connectUsb">
	<div class="form-grid">
		{#each pairingFields as field (field.name)}
			<label>
				<span>{field.label}</span>
				<input
					name={field.name}
					type="text"
					bind:value={state.usbForm[field.name]}
					autocomplete="off"
					inputmode={field.inputmode}
					placeholder={field.placeholder}
				/>
			</label>
		{/each}
	</div>
	<input type="hidden" name="staticIp" value={state.usbForm.staticIp} />
	<input type="hidden" name="gateway" value={state.usbForm.gateway} />
	<input type="hidden" name="subnet" value={state.usbForm.subnet} />
	<input type="hidden" name="dns" value={state.usbForm.dns} />
</form>
