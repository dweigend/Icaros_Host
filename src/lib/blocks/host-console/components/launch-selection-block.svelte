<!--
	Purpose: host console block for selected launch client status and launch controls.
-->
<script lang="ts">
	import { ExternalLink } from '@lucide/svelte';
	import { Button, Kbd, StatusDot } from '$lib/components';
	import type { ConsolePageState } from '../../../../routes/console-state.svelte';

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();
</script>

<h2 id="launch-selection-title">Launch Selection</h2>
<section class="card" aria-labelledby="launch-selection-title">
    <div class="row">
        <div class="stack">
            <strong>selected launch client</strong>
            <Kbd>{state.activeClientId ?? "none"}</Kbd>
        </div>
        <StatusDot
            tone={state.connectionUrls.experienceTargetUrl === null ? "default" : "success"}
            label={state.connectionUrls.experienceTargetUrl === null
                ? "No launch target"
                : "Launch target ready"}
        />
    </div>

    <p>
        Launch target:
        <Kbd>{state.connectionUrls.experienceTargetUrl ?? "pending selected launch client"}</Kbd>
    </p>

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
