<!--
	Purpose: host console block for selected launch client status and launch controls.
-->
<script lang="ts">
	import { CircleStop, ExternalLink, Save } from '@lucide/svelte';
	import { Button, Kbd, Select, StatusDot } from '$lib/components';
	import type { HostConsoleState } from '../types';

	type Props = Readonly<{
		state: HostConsoleState;
	}>;

	let { state }: Props = $props();

	const launchClientOptions = $derived(
		state.runtimeClients.map((client) => ({
			disabled: client.status !== 'online',
			label: `${client.title} - ${client.experienceId}`,
			value: client.clientId
		}))
	);
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
			items={launchClientOptions}
			disabled={launchClientOptions.length === 0}
		/>
		<Button type="submit" variant="primary" disabled={launchClientOptions.length === 0}>
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
