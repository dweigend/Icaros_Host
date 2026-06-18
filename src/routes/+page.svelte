<!--
	Purpose: single-page Icaros Host operator console. Route-private panels and
	state live under _console so this route stays a compact composition boundary.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	import ConnectionAddressesPanel from './_console/components/connection-addresses-panel.svelte';
	import ControlStreamPanel from './_console/components/control-stream-panel.svelte';
	import ControllerSetupPanel from './_console/components/controller-setup-panel.svelte';
	import LaunchSelectionPanel from './_console/components/launch-selection-panel.svelte';
	import RuntimeClientsPanel from './_console/components/runtime-clients-panel.svelte';
	import { createConsolePageState } from './_console';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const consoleState = createConsolePageState(() => data);

	onMount(() => consoleState.mountConsoleLiveSockets());
</script>

<svelte:head>
	<title>Icaros Host Console</title>
</svelte:head>

<main class="console">
	<header class="top">
		<h1>Icaros Host</h1>
	</header>

	<ConnectionAddressesPanel urls={consoleState.connectionUrls} />
	<LaunchSelectionPanel state={consoleState.launch} />
	<RuntimeClientsPanel state={consoleState.registry} />
	<ControllerSetupPanel state={consoleState.controller} />
	<ControlStreamPanel state={consoleState.controlStream} />
</main>
