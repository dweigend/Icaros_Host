<!--
	Purpose: route-private panel for live normalized controller telemetry from
	the public control stream.
-->
<script lang="ts">
	import { Crosshair, Gauge, RotateCcw } from '@lucide/svelte';

	import { Button, ScrollArea, StatusDot, Switch } from '$lib/components';
	import { formatAge, formatSignedUnit, toQualityPercent } from '../format';
	import type { HostConsoleControlStreamPanelState } from '../types';

	type Props = Readonly<{
		state: HostConsoleControlStreamPanelState;
	}>;

	let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="control-stream-title">
	<div class="row">
		<h2 id="control-stream-title">Public Control Stream</h2>
		<div class="status">
			<StatusDot tone={state.debugStatusTone} label={`Control stream monitor ${state.debugStatus}`} />
			<span>{state.debugStatus}</span>
		</div>
	</div>

	<div class="metrics">
		<article class="metric">
			<h2>last control</h2>
			<div class="readout">
				<strong>
					{state.debugLastControl === null ? 'no frame' : formatSignedUnit(state.debugLastControl.pitch)}
				</strong>
				<span>pitch</span>
			</div>
			<progress class="meter" max="100" value={state.debugPitchPercent} aria-label="Pitch">
				{state.debugPitchPercent}%
			</progress>
		</article>

		<article class="metric">
			<h2>roll</h2>
			<div class="readout">
				<strong>
					{state.debugLastControl === null ? 'no frame' : formatSignedUnit(state.debugLastControl.roll)}
				</strong>
				<span>roll</span>
			</div>
			<progress class="meter" max="100" value={state.debugRollPercent} aria-label="Roll">
				{state.debugRollPercent}%
			</progress>
		</article>

		<article class="metric">
			<h2>quality</h2>
			<div class="readout">
				<strong>{state.debugQualityPercent}%</strong>
				<span>{state.debugLastControl?.controllerType ?? 'm5'}</span>
			</div>
			<progress class="meter quality" max="100" value={state.debugQualityPercent} aria-label="Quality">
				{state.debugQualityPercent}%
			</progress>
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

	<div class="actions">
		<form method="POST" action="?/calibrateCurrentPose">
			<Button type="submit" variant="primary" disabled={!state.canCalibrateCurrentPose}>
				<Crosshair size={16} aria-hidden="true" />
				Current pose as neutral
			</Button>
		</form>
		<form method="POST" action="?/resetM5Calibration">
			<Button type="submit" variant="ghost" disabled={!state.m5Calibration.isActive}>
				<RotateCcw size={16} aria-hidden="true" />
				Reset calibration
			</Button>
		</form>
		<p>
			offset pitch {formatSignedUnit(state.m5Calibration.pitchOffset)} / roll
			{formatSignedUnit(state.m5Calibration.rollOffset)}
		</p>
	</div>

	<div class="actions">
		<form method="POST" action="?/setOrientationMap">
			<input type="hidden" name="field" value="swapPitchRoll" />
			<input
				type="hidden"
				name="enabled"
				value={state.m5OrientationMap.swapPitchRoll ? 'false' : 'true'}
			/>
			<Switch
				checked={state.m5OrientationMap.swapPitchRoll}
				label="Swap pitch/roll"
				description={state.m5OrientationMap.swapPitchRoll ? 'Ein' : 'Aus'}
				onclick={(event) => event.currentTarget.closest('form')?.requestSubmit()}
			/>
		</form>
		<form method="POST" action="?/setOrientationMap">
			<input type="hidden" name="field" value="invertPitch" />
			<input
				type="hidden"
				name="enabled"
				value={state.m5OrientationMap.invertPitch ? 'false' : 'true'}
			/>
			<Switch
				checked={state.m5OrientationMap.invertPitch}
				label="Invert pitch"
				description={state.m5OrientationMap.invertPitch ? 'Ein' : 'Aus'}
				onclick={(event) => event.currentTarget.closest('form')?.requestSubmit()}
			/>
		</form>
		<form method="POST" action="?/setOrientationMap">
			<input type="hidden" name="field" value="invertRoll" />
			<input
				type="hidden"
				name="enabled"
				value={state.m5OrientationMap.invertRoll ? 'false' : 'true'}
			/>
			<Switch
				checked={state.m5OrientationMap.invertRoll}
				label="Invert roll"
				description={state.m5OrientationMap.invertRoll ? 'Ein' : 'Aus'}
				onclick={(event) => event.currentTarget.closest('form')?.requestSubmit()}
			/>
		</form>
	</div>

	<ScrollArea class="log" aria-label="Recent control frames">
		{#each state.debugFrames as frame (frame.id)}
			<div class="log-row" data-neutral={frame.quality <= 0}>
				<span>{formatAge(state.debugNow - frame.receivedAt)}</span>
				<code>pitch {formatSignedUnit(frame.pitch)}</code>
				<code>roll {formatSignedUnit(frame.roll)}</code>
				<span>q {toQualityPercent(frame.quality)}%</span>
				<span>{frame.controllerType}</span>
			</div>
		{:else}
			<p>Noch keine <code>control.orientation</code>-Frames empfangen.</p>
		{/each}
	</ScrollArea>
</section>
