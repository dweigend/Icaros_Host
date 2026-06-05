<!--
	Purpose: Accordion content wrapper.
-->
<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	import { accordionContentClass } from '../accordion.svelte';
	import type { AccordionContentProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: AccordionContentProps = $props();
</script>

<AccordionPrimitive.Content
	bind:ref
	{...restProps}
	class={[accordionContentClass, className]}
/>

<style>
	:global(.ui-accordion__content) {
		min-width: 0;
		overflow: hidden;
		padding: 0 0.75rem 0.75rem;
		color: var(--color-text-soft);
	}
</style>
