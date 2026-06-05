<!--
	Purpose: Collapsible trigger styled with Bits UI state attributes.
-->
<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';

	import { collapsibleTriggerClass } from '../collapsible.svelte';
	import type { CollapsibleTriggerProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: CollapsibleTriggerProps = $props();
</script>

<CollapsiblePrimitive.Trigger
	bind:ref
	{...restProps}
	class={[collapsibleTriggerClass, className]}
/>

<style>
	:global(.ui-collapsible__trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		min-height: 2rem;
		padding: 0;
		border: 0;
		color: var(--color-text);
		background: transparent;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}

	:global(.ui-collapsible__trigger:hover) {
		color: var(--color-text-strong);
	}
</style>
