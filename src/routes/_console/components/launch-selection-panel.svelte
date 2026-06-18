<!--
	Purpose: route-private panel for selecting and opening the active launch
	client. Form actions remain owned by the route server module.
-->
<script lang="ts">
	import { CircleStop, ExternalLink, Save } from '@lucide/svelte';

	import { Button, Kbd, Select, StatusDot } from '$lib/components';
	import type { HostConsoleLaunchState } from '../types';

	type Props = Readonly<{
		state: HostConsoleLaunchState;
	}>;

	let { state }: Props = $props();
</script>

<h2 id="launch-selection-title">Launch Selection</h2>
<section class="card" aria-labelledby="launch-selection-title">
	<div class="row">
		<div class="stack">
			<strong>selected launch client</strong>
			<Kbd>{state.selectedLaunchClientId ?? 'none'}</Kbd>
		</div>
		<StatusDot
			tone={state.connectionUrls.experienceTargetUrl === null ? 'default' : 'success'}
			label={state.connectionUrls.experienceTargetUrl === null
				? 'No launch target'
				: 'Launch target ready'}
		/>
	</div>

	<p>
		Launch target:
		<Kbd>{state.connectionUrls.experienceTargetUrl ?? 'pending selected launch client'}</Kbd>
	</p>

	<form class="actions" method="POST" action="?/setSelectedLaunchClient">
		<Select
			label="Select launch client"
			name="clientId"
			placeholder="Select launch client"
			value={state.selectedLaunchClientId ?? ''}
			items={state.launchClientOptions}
			disabled={state.launchClientOptions.length === 0}
		/>
		<Button type="submit" variant="primary" disabled={state.launchClientOptions.length === 0}>
			<Save size={16} aria-hidden="true" />
			Save Launch
		</Button>
	</form>

	{#if state.selectedLaunchClientId !== null}
		<form method="POST" action="?/setSelectedLaunchClient">
			<input type="hidden" name="clientId" value="" />
			<Button type="submit" variant="ghost">
				<CircleStop size={16} aria-hidden="true" />
				Clear Launch
			</Button>
		</form>
	{/if}

	{#if state.connectionUrls.experienceTargetUrl !== null}
		<Button
			href={state.connectionUrls.questLaunchUrl}
			variant="secondary"
			target="_blank"
			rel="noreferrer"
		>
			<ExternalLink size={16} aria-hidden="true" />
			Open Launch
		</Button>
	{/if}
</section>
