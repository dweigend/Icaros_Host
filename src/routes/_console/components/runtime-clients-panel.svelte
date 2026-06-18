<!--
	Purpose: route-private panel for runtime client presence and selected launch
	client visibility.
-->
<script lang="ts">
	import { Kbd, StatusDot } from '$lib/components';
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
			<article class="runtime-client" data-active={state.selectedLaunchClientId === client.clientId}>
				<div class="row">
					<div class="stack">
						<strong>{client.title}</strong>
						<span>{client.experienceId}</span>
					</div>
					<StatusDot
						tone={client.status === 'online' ? 'success' : 'warning'}
						label={`Runtime client ${client.status}`}
					/>
				</div>

				<dl class="client-facts">
					<div><dt>client</dt><dd><Kbd>{formatRuntimeClientId(client.clientId)}</Kbd></dd></div>
					<div><dt>last seen</dt><dd>{formatRuntimeClientSeen(client, state.now)}</dd></div>
					<div><dt>url</dt><dd><Kbd>{client.url}</Kbd></dd></div>
					{#if client.userAgent}
						<div><dt>agent</dt><dd>{client.userAgent}</dd></div>
					{/if}
				</dl>

				{#if state.selectedLaunchClientId === client.clientId}
					<div class="status">
						<StatusDot tone="success" label="Selected launch client" />
						<span>selected launch client</span>
					</div>
				{/if}
			</article>
		{:else}
			<p>
				Noch keine registrierten HTTPS Launch Clients. Ein Runtime Client muss
				<code>client.hello</code> über <code>wss://</code> senden.
			</p>
		{/each}
	</div>
</section>
