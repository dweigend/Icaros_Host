<!--
	Purpose: Accordion item wrapper.
-->
<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	import { accordionItemClass } from '../accordion.svelte';
	import type { AccordionItemProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: AccordionItemProps = $props();
</script>

<AccordionPrimitive.Item bind:ref {...restProps} class={[accordionItemClass, className]} />

<style>
	:global(.ui-accordion__item) {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-background);
	}
</style>
