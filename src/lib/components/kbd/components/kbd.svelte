<!--
	Purpose: terminal command hint chip.
-->
<script lang="ts">
	import { joinClassNames } from '$lib/utils/class-names';
	import type { KbdProps } from '../types';

	let { children, class: className = '', ...restProps }: KbdProps = $props();
</script>

<kbd {...restProps} class={joinClassNames('ui-kbd', className)}>
	{@render children?.()}
</kbd>

<style>
	.ui-kbd {
		display: inline-flex;
		align-items: center;
		min-height: 1.45rem;
		max-width: 100%;
		padding: 0 0.45rem;
		border: 1px solid var(--color-border);
		border-radius: 0.25rem;
		color: var(--color-text-strong);
		background: var(--color-surface);
		font-size: 0.76rem;
		overflow-wrap: anywhere;
	}
</style>
