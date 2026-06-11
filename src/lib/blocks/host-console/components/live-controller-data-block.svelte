<!--
	Purpose: host console block for live normalized controller telemetry.
-->
<script lang="ts">
	import { Gauge } from '@lucide/svelte';

	import { Kbd, ScrollArea, StatusDot } from '$lib/components';
	import type { ConsolePageState } from '../../../../routes/console-state.svelte';
	import { formatAge, formatSignedUnit, toQualityPercent } from '../../../../routes/runtime-debug';

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="control-stream-title">
    <div class="row">
        <h2 id="control-stream-title">Public Control Stream</h2>
        <div class="status">
            <StatusDot
                tone={state.debugStatusTone}
                label={`Control stream monitor ${state.debugStatus}`}
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
				<span style:--progress-value={`${state.debugPitchPercent}%`}></span>
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
				<span style:--progress-value={`${state.debugRollPercent}%`}></span>
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
				<span style:--progress-value={`${state.debugQualityPercent}%`}></span>
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
                {state.connectionUrls.controlSocketUrl}
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
