<!--
	Purpose: route-private top panel for the operator's most important Host and
	client start addresses. It displays derived data only and owns no runtime state.
-->
<script lang="ts">
	import { Glasses, Play } from '@lucide/svelte';

	import type { HostConsoleConnectionUrls } from '../types';

	type Props = Readonly<{
		urls: HostConsoleConnectionUrls;
	}>;

	let { urls }: Props = $props();
</script>

<section class="card start-panel" aria-labelledby="host-access-title">
	<div class="start-panel__header">
		<div class="stack">
			<h2 id="host-access-title">Host lokal öffnen</h2>
			<strong>{urls.localConsoleUrl}</strong>
		</div>
		<div class="stack">
			<span>Remote / LAN Host</span>
			<code>{urls.consoleUrl}</code>
		</div>
	</div>

	<div class="command-grid" aria-label="Client start commands">
		<div>
			<span>Connect Client via</span>
			<code><Play size={16} aria-hidden="true" />{urls.clientStartCommand}</code>
		</div>
		<div>
			<span>Headset Launch</span>
			<code><Glasses size={16} aria-hidden="true" />{urls.questLaunchUrl}</code>
		</div>
	</div>
</section>
