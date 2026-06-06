<!--
	Purpose: route-local live normalized controller telemetry panel for operators.
-->
<script lang="ts">
    import { Gauge } from "@lucide/svelte";

    import { Kbd, ScrollArea, StatusDot } from "$lib/components";
    import {
        formatAge,
        formatSignedUnit,
        toQualityPercent,
    } from "./runtime-debug";
    import type { ConsolePageState } from "./console-state.svelte";

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="debug-title">
    <div class="row">
        <h2 id="debug-title">Live Controller Daten</h2>
        <div class="status">
            <StatusDot
                tone={state.debugStatusTone}
                label={`Runtime debug ${state.debugStatus}`}
            />
            <span>{state.debugStatus}</span>
        </div>
    </div>

    <div class="metrics">
        <article class="metric">
            <h2>last control</h2>
            <div class="readout">
                <strong>
                    {state.debugLastControl === null
                        ? "no frame"
                        : formatSignedUnit(state.debugLastControl.pitch)}
                </strong>
                <span>pitch</span>
            </div>
            <div class="meter" aria-label="Pitch">
                <span style:width={`${state.debugPitchPercent}%`}></span>
            </div>
        </article>

        <article class="metric">
            <h2>roll</h2>
            <div class="readout">
                <strong>
                    {state.debugLastControl === null
                        ? "no frame"
                        : formatSignedUnit(state.debugLastControl.roll)}
                </strong>
                <span>roll</span>
            </div>
            <div class="meter" aria-label="Roll">
                <span style:width={`${state.debugRollPercent}%`}></span>
            </div>
        </article>

        <article class="metric">
            <h2>quality</h2>
            <div class="readout">
                <strong>{state.debugQualityPercent}%</strong>
                <span
                    >{state.debugLastControl?.safeMode
                        ? "safe mode"
                        : "live"}</span
                >
            </div>
            <div class="meter quality" aria-label="Quality">
                <span style:width={`${state.debugQualityPercent}%`}></span>
            </div>
        </article>

        <article class="metric">
            <h2>frames</h2>
            <div class="readout">
                <strong>{state.debugFrameCount}</strong>
                <span>last {state.debugLastMessageAge}</span>
            </div>
            <p>
                <Gauge size={14} aria-hidden="true" />
                {state.debugTargetExperienceId ?? "no active experience"}
            </p>
        </article>
    </div>

    <ScrollArea class="log" aria-label="Recent control frames">
        {#each state.debugFrames as frame (frame.id)}
            <div class="log-row" data-safe={frame.safeMode}>
                <span>{formatAge(state.debugNow - frame.receivedAt)}</span>
                <code>pitch {formatSignedUnit(frame.pitch)}</code>
                <code>roll {formatSignedUnit(frame.roll)}</code>
                <span>q {toQualityPercent(frame.quality)}%</span>
                <span>{frame.safeMode ? "safe" : "live"}</span>
            </div>
        {:else}
            <p>Noch keine <code>control.orientation</code>-Frames empfangen.</p>
        {/each}
    </ScrollArea>
</section>
