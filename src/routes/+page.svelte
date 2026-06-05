<!--
	Purpose: single-page Icaros Host route. Data loading stays in +page.server.ts;
	the composed console block owns presentation and form markup.
-->
<script lang="ts">
	import { HostConsole } from '$lib/blocks';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Icaros Host Console</title>
</svelte:head>

<HostConsole connection={data.connection} station={data.station} />
