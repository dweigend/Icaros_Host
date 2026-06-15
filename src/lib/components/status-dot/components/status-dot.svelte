<!--
	Purpose: small semantic terminal status dot.
-->
<script lang="ts">
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
	class={['ui-status-dot', statusDotToneClassByTone[tone], className]}
	data-tone={tone}
	role={!decorative && label ? 'img' : undefined}
></span>

<style>
	.ui-status-dot {
		display: inline-block;
		width: 0.6rem;
		height: 0.6rem;
		background: var(--color-muted);
	}

	.ui-status-dot--success {
		background: var(--color-success);
	}

	.ui-status-dot--warning {
		background: var(--color-warning);
	}

	.ui-status-dot--danger {
		background: var(--color-danger);
	}
</style>
