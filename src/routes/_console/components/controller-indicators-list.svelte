<!--
	Purpose: route-private checklist for derived M5 controller setup indicators.
	It renders status data only and owns no setup workflow behavior.
-->
<script lang="ts">
	import { StatusDot } from '$lib/components';
	import type { HostConsoleControllerIndicator } from '../types';

	type Props = Readonly<{
		indicators: readonly HostConsoleControllerIndicator[];
	}>;

	let { indicators }: Props = $props();
</script>

<ol class="runtime-clients" aria-label="Controller setup checklist">
	{#each indicators as indicator (indicator.label)}
		<li class="runtime-client" data-tone={indicator.tone}>
			<div class="status">
				<StatusDot tone={indicator.tone} label={`${indicator.label} ${indicator.value}`} />
				<span>{indicator.label}</span>
			</div>
			<div>
				<strong>{indicator.value}</strong>
				<p>{indicator.detail}</p>
			</div>
		</li>
	{/each}
</ol>
