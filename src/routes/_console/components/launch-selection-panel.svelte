<!--
	Purpose: route-private panel for selecting and opening the active launch
	client. Form actions remain owned by the route server module.
-->
<script lang="ts">
	import { ExternalLink, Save } from '@lucide/svelte';

	import { Button, Select } from '$lib/components';
	import type { HostConsoleLaunchState } from '../types';

	type Props = Readonly<{
		state: HostConsoleLaunchState;
	}>;

	let { state }: Props = $props();

	const canSelectClient = $derived(state.launchClientOptions.some((item) => item.disabled !== true));
	const hasLaunchTarget = $derived(state.launchTargetUrl !== null);
</script>

<h2 id="launch-selection-title">Launch Selection</h2>
<section class="card" aria-labelledby="launch-selection-title">
	<form class="actions" method="POST" action="?/setSelectedLaunchClient">
		<Select
			label="Select launch client"
			name="clientId"
			placeholder="Select launch client"
			value={state.selectedLaunchClientId ?? ''}
			items={state.launchClientOptions}
			disabled={!canSelectClient}
		/>
		<Button type="submit" variant="primary" disabled={!canSelectClient}>
			<Save size={16} aria-hidden="true" />
			Select Client
		</Button>

		{#if hasLaunchTarget}
			<Button
				href={state.connectionUrls.questLaunchUrl}
				variant="secondary"
				target="_blank"
				rel="noreferrer"
			>
				<ExternalLink size={16} aria-hidden="true" />
				Start Launch
			</Button>
		{/if}
	</form>
</section>
