<!--
	Purpose: route-local selected runtime client status and launch controls.
-->
<script lang="ts">
    import { ExternalLink } from "@lucide/svelte";
    import { Button, Kbd, StatusDot } from "$lib/components";
    import type { ConsolePageState } from "./console-state.svelte";

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();
</script>

<h2 id="runtime-routing-title">Aktiver Runtime Client</h2>
<section class="card" aria-labelledby="runtime-routing-title">
    <div class="row">
        <div class="stack">
            <strong>selected client</strong>
            <Kbd>{state.activeClientId ?? "none"}</Kbd>
        </div>
        <StatusDot
            tone={state.connectionUrls.experienceTargetUrl === null ? "default" : "success"}
            label={state.connectionUrls.experienceTargetUrl === null
                ? "No launch target"
                : "Launch target ready"}
        />
    </div>

    <p>Derived experience id: <Kbd>{state.activeExperienceId ?? "none"}</Kbd></p>
    <p>
        Launch target:
        <Kbd>{state.connectionUrls.experienceTargetUrl ?? "pending selected runtime client"}</Kbd>
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
