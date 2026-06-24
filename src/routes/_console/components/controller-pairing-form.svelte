<!--
	Purpose: route-private M5 WiFi and device setup form. It only collects
	operator input; pairing execution belongs to route server actions.
-->
<script lang="ts">
	import { PlugZap } from '@lucide/svelte';

	import { Button } from '$lib/components';
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
		{ name: 'ssid', label: 'SSID' },
		{ name: 'password', label: 'WiFi Passwort' },
		{ name: 'deviceId', label: 'Device ID' },
		{ name: 'staticIp', label: 'Statische IP', inputmode: 'decimal', placeholder: 'optional' },
		{ name: 'gateway', label: 'Gateway', inputmode: 'decimal', placeholder: 'optional' },
		{ name: 'subnet', label: 'Subnetz', inputmode: 'decimal', placeholder: '255.255.255.0' },
		{ name: 'dns', label: 'DNS', inputmode: 'decimal', placeholder: 'optional' }
	];
</script>

<form class="stack" method="POST" action="?/connectUsb">
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

	<div class="actions">
		<Button
			type="submit"
			variant="primary"
			disabled={state.usbSetupBusy ||
				!state.usbSetup.canConfigure ||
				state.usbForm.ssid.trim() === '' ||
				state.usbForm.password === ''}
		>
			<PlugZap size={16} aria-hidden="true" />
			{state.usbSetupBusy ? 'Läuft' : 'Pairing einrichten'}
		</Button>
	</div>
</form>
