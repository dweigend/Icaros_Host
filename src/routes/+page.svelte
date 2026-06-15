<!--
	Purpose: single-page Icaros Host operator console composed from reusable
	host console blocks. Route data stays in +page.server.ts.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	import {
		HostConsoleConnectionAddressesBlock,
		HostConsoleControllerSetupBlock,
		HostConsoleLaunchSelectionBlock,
		HostConsoleLiveControllerDataBlock,
		HostConsoleRuntimeClientsBlock
	} from '$lib/blocks/host-console';
	import type { PageProps } from './$types';
	import { createConsolePageState } from './console-state.svelte';

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
	<HostConsoleConnectionAddressesBlock urls={consoleState.connectionUrls} />
	<HostConsoleLaunchSelectionBlock state={consoleState} />
	<HostConsoleRuntimeClientsBlock state={consoleState} />
	<HostConsoleControllerSetupBlock state={consoleState} />
	<HostConsoleLiveControllerDataBlock state={consoleState} />
</main>
