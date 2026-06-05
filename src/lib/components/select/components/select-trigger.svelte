<!--
	Purpose: Select trigger wrapper with Bits UI ref forwarding.
-->
<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';

	import { selectTriggerClass } from '../select.svelte';
	import type { SelectTriggerProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: SelectTriggerProps = $props();
</script>

<SelectPrimitive.Trigger bind:ref {...restProps} class={[selectTriggerClass, className]} />

<style>
	:global(.ui-select-trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		width: 100%;
		min-height: 2.25rem;
		min-width: 0;
		padding: 0 0.75rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 0.4rem;
		color: var(--color-text);
		background: var(--color-surface-raised);
		font: inherit;
		font-size: 0.82rem;
		cursor: pointer;
	}

	:global(.ui-select-trigger:disabled) {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
