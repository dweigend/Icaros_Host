<!--
	Purpose: route-private panel for runtime client presence and selected launch
	client visibility.
-->
<script lang="ts">
	import { X } from '@lucide/svelte';

	import { Button, StatusDot } from '$lib/components';
	import { DEFAULT_EXPERIENCE_ID } from '$lib/protocol';
	import { formatRuntimeClientId, formatRuntimeClientSeen } from '../format';
	import type { HostConsoleRuntimeRegistryState } from '../types';

	type Props = Readonly<{
		state: HostConsoleRuntimeRegistryState;
	}>;

	let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="runtime-clients-title">
	<div class="row">
		<h2 id="runtime-clients-title">Launch Client Registry</h2>
		<div class="status">
			<StatusDot
				tone={state.runtimeClients.length === 0 ? 'default' : 'success'}
				label={`${state.runtimeClients.length} registered launch clients`}
			/>
			<span>{state.runtimeClients.length} online/stale</span>
		</div>
	</div>

	<div class="runtime-clients">
		{#each state.runtimeClients as client (client.clientId)}
			{@const active = state.selectedLaunchClientId === client.clientId}
			{@const isDefaultExperience = client.experienceId === DEFAULT_EXPERIENCE_ID}
			<article class="runtime-client" data-active={active}>
				<div class="row">
					<div class="status">
						<StatusDot
							tone={client.status === 'online' ? 'success' : 'warning'}
							label={`Runtime client ${client.status}`}
						/>
						<strong>{client.title}</strong>
						{#if isDefaultExperience}
							<span>default</span>
						{/if}
					</div>

					{#if active}
						<form method="POST" action="?/setSelectedLaunchClient">
							<input type="hidden" name="clientId" value="" />
							<Button type="submit" variant="ghost" aria-label={`Clear launch client ${client.title}`}>
								<X size={16} aria-hidden="true" />
								Clear
							</Button>
						</form>
					{/if}
				</div>

				<dl class="client-facts">
					<div><dt>client</dt><dd>{formatRuntimeClientId(client.clientId)}</dd></div>
					<div><dt>last seen</dt><dd>{formatRuntimeClientSeen(client, state.now)}</dd></div>
					<div><dt>url</dt><dd>{client.url}</dd></div>
				</dl>
			</article>
		{:else}
			<p>
				Noch keine registrierten HTTPS Launch Clients. Ein Runtime Client muss
				<code>client.hello</code> über <code>wss://</code> senden.
			</p>
		{/each}
	</div>
</section>
