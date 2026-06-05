<!--
	Purpose: Accordion trigger styled through Bits UI data-state attributes.
-->
<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	import { accordionTriggerClass } from '../accordion.svelte';
	import type { AccordionTriggerProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: AccordionTriggerProps = $props();
</script>

<AccordionPrimitive.Trigger
	bind:ref
	{...restProps}
	class={[accordionTriggerClass, className]}
/>

<style>
	:global(.ui-accordion__trigger) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		min-height: 2.4rem;
		padding: 0 0.75rem;
		border: 0;
		color: var(--color-text);
		background: transparent;
		font: inherit;
		font-size: 0.82rem;
		font-weight: 800;
		cursor: pointer;
	}

	:global(.ui-accordion__trigger[data-state='open']) {
		color: var(--color-accent);
	}
</style>
