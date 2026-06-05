<!--
	Purpose: Accordion header wrapper.
-->
<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	import { accordionHeaderClass } from '../accordion.svelte';
	import type { AccordionHeaderProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: AccordionHeaderProps = $props();
</script>

<AccordionPrimitive.Header
	bind:ref
	{...restProps}
	class={[accordionHeaderClass, className]}
/>

<style>
	:global(.ui-accordion__header) {
		margin: 0;
	}
</style>
