<!--
	Purpose: host console block for runtime client presence.
-->
<script lang="ts">
	import { Kbd, StatusDot } from '$lib/components';
	import type { RuntimeClientSummary } from '$lib/protocol';
	import type { ConsolePageState } from '../../../../routes/console-state.svelte';
	import { formatAge } from '../../../../routes/runtime-debug';

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();

    function isActive(client: RuntimeClientSummary): boolean {
        return state.activeClientId === client.clientId;
    }

    function formatClientId(clientId: string): string {
        return clientId.length <= 12
            ? clientId
            : `${clientId.slice(0, 8)}...${clientId.slice(-4)}`;
    }

	function formatSeen(client: RuntimeClientSummary): string {
		return formatAge(state.debugNow - client.lastSeenAt);
	}
</script>

<section class="card" aria-labelledby="runtime-clients-title">
    <div class="row">
        <h2 id="runtime-clients-title">Launch Client Registry</h2>
        <div class="status">
            <StatusDot
                tone={state.runtimeClients.length === 0 ? "default" : "success"}
                label={`${state.runtimeClients.length} registered launch clients`}
            />
            <span>{state.runtimeClients.length} online/stale</span>
        </div>
    </div>

    <div class="runtime-clients">
        {#each state.runtimeClients as client (client.clientId)}
            <article class="runtime-client" data-active={isActive(client)}>
                <div class="row">
                    <div class="stack">
                        <strong>{client.title}</strong>
                        <span>{client.experienceId}</span>
                    </div>
                    <StatusDot
                        tone={client.status === "online" ? "success" : "warning"}
                        label={`Runtime client ${client.status}`}
                    />
                </div>

                <dl class="client-facts">
                    <div>
                        <dt>client</dt>
                        <dd><Kbd>{formatClientId(client.clientId)}</Kbd></dd>
                    </div>
                    <div>
                        <dt>last seen</dt>
                        <dd>{formatSeen(client)}</dd>
                    </div>
                    <div>
                        <dt>url</dt>
                        <dd><Kbd>{client.url}</Kbd></dd>
                    </div>
                    {#if client.userAgent}
                        <div>
                            <dt>agent</dt>
                            <dd>{client.userAgent}</dd>
                        </div>
                    {/if}
                </dl>

				{#if isActive(client)}
					<div class="status">
						<StatusDot tone="success" label="Selected launch client" />
						<span>selected launch client</span>
					</div>
				{/if}
            </article>
        {:else}
            <p>
                Noch keine registrierten HTTPS Launch Clients. Ein Runtime Client
                muss <code>client.hello</code> über <code>wss://</code> senden.
            </p>
        {/each}
    </div>
</section>
