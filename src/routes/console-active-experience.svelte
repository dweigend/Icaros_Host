<!--
	Purpose: route-local active experience status and operator form controls.
-->
<script lang="ts">
    import { CircleStop, ExternalLink, Play } from "@lucide/svelte";
    import { Button, Kbd, StatusDot } from "$lib/components";
    import type { ConsolePageState } from "./console-state.svelte";

    type Props = Readonly<{
        state: ConsolePageState;
        mode?: "summary" | "controls";
    }>;

    let { state, mode = "controls" }: Props = $props();
</script>

<h2 id="experience-title">Aktive Experience</h2>
{#if mode === "summary"}
    <article class="card primary">
        <div class="row">
            <h2>active experience</h2>
            <StatusDot
                tone={state.activeExperienceId === null ? "default" : "success"}
                label={state.activeExperienceId === null
                    ? "No active experience"
                    : "Experience active"}
            />
        </div>
        <strong>{state.activeExperienceId ?? "none"}</strong>
        <p>active client: {state.activeClientId ?? "none"}</p>
        <p>
            Nur diese Experience erhält normalisierte M5-Steuerdaten über den
            Runtime-Socket.
        </p>
    </article>
{:else}
    <section class="card" aria-labelledby="experience-title">
        <p>Active client: <Kbd>{state.activeClientId ?? "none"}</Kbd></p>
        <div class="row">
            <form class="actions" method="POST" action="?/setActive">
                <input
                    name="experienceId"
                    bind:value={state.selectedExperienceId}
                    autocomplete="off"
                    inputmode="text"
                    pattern="[a-z0-9][-a-z0-9]*"
                    placeholder="echo-flight"
                    aria-label="Active experience id"
                />
                <Button
                    type="submit"
                    variant="primary"
                    disabled={state.selectedExperienceId === ""}
                >
                    <Play size={16} aria-hidden="true" />
                    Aktiv setzen
                </Button>
            </form>

            {#if state.activeExperienceId !== null}
                <form method="POST" action="?/setActive">
                    <input type="hidden" name="experienceId" value="" />
                    <Button type="submit" variant="ghost">
                        <CircleStop size={16} aria-hidden="true" />
                        Clear
                    </Button>
                </form>
                <Button
                    href={state.connectionUrls.questLaunchUrl}
                    variant="secondary"
                    target="_blank"
                    rel="noreferrer"
                >
                    <ExternalLink size={16} aria-hidden="true" />
                    Host Launch
                </Button>
            {/if}
        </div>
    </section>
{/if}
