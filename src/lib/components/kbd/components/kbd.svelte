<!--
	Purpose: terminal command hint chip.
-->
<script lang="ts">
	import type { KbdProps } from '../types';

	let { children, class: className = '', ...restProps }: KbdProps = $props();
</script>

<kbd {...restProps} class={['ui-kbd', className]}>
	{@render children?.()}
</kbd>

<style>
	.ui-kbd {
		display: inline-flex;
		align-items: center;
		min-height: 1.25rem;
		max-width: 100%;
		padding: 0 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 0;
		color: var(--color-text-strong);
		background: color-mix(in srgb, var(--color-surface), transparent 35%);
		font-size: var(--font-size-sm);
		overflow-wrap: anywhere;
	}
</style>
