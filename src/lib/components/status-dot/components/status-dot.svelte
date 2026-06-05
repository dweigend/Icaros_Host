<!--
	Purpose: small semantic terminal status dot.
-->
<script lang="ts">
	import { joinClassNames } from '$lib/utils/class-names';
	import { statusDotToneClassByTone } from '../status-dot.svelte';
	import type { StatusDotProps } from '../types';

	let {
		class: className = '',
		decorative = false,
		label,
		tone = 'default',
		...restProps
	}: StatusDotProps = $props();
</script>

<span
	{...restProps}
	aria-hidden={decorative || undefined}
	aria-label={!decorative ? label : undefined}
	class={joinClassNames('ui-status-dot', statusDotToneClassByTone[tone], className)}
	data-tone={tone}
	role={!decorative && label ? 'img' : undefined}
></span>

<style>
	.ui-status-dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 999px;
		background: var(--color-muted);
		box-shadow: 0 0 0 1px var(--color-border);
	}

	.ui-status-dot--success {
		background: var(--color-success);
		box-shadow: 0 0 0 1px var(--color-success), 0 0 16px color-mix(in srgb, var(--color-success), transparent 45%);
	}

	.ui-status-dot--warning {
		background: var(--color-warning);
		box-shadow: 0 0 0 1px var(--color-warning), 0 0 16px color-mix(in srgb, var(--color-warning), transparent 45%);
	}

	.ui-status-dot--danger {
		background: var(--color-danger);
		box-shadow: 0 0 0 1px var(--color-danger), 0 0 16px color-mix(in srgb, var(--color-danger), transparent 45%);
	}
</style>
