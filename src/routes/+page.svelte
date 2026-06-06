<!--
	Purpose: single-page Icaros Host operator console composed from route-local
	console panels. Route data stays in +page.server.ts.
-->
<script lang="ts">
    import { onMount } from "svelte";

    import ConsoleActiveExperience from "./console-active-experience.svelte";
    import ConsoleConnectionAddresses from "./console-connection-addresses.svelte";
    import ConsoleControllerSetup from "./console-controller-setup.svelte";
    import ConsoleLiveControllerData from "./console-live-controller-data.svelte";
    import { createConsolePageState } from "./console-state.svelte";
    import type { PageProps } from "./$types";

    let { data }: PageProps = $props();

    const consoleState = createConsolePageState(() => data);

    onMount(() => consoleState.mountRuntimeDebugSocket());
</script>

<svelte:head>
    <title>Icaros Host Console</title>
</svelte:head>

<main class="console">
    <header class="top">
        <h1>Icaros Host</h1>
    </header>
    <ConsoleConnectionAddresses urls={consoleState.connectionUrls} />
    <ConsoleActiveExperience state={consoleState} />
    <ConsoleControllerSetup state={consoleState} />
    <ConsoleLiveControllerData state={consoleState} />
</main>
