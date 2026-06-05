<!--
	Purpose: Accordion root that forwards the official Bits UI API.
-->
<script lang="ts">
	import { Accordion as AccordionPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import { accordionRootClass } from '../accordion.svelte';
	import type { AccordionRootProps } from '../types';

	let {
		ref = $bindable(null),
		class: className = '',
		type,
		value = $bindable<string | string[] | undefined>(undefined),
		...restProps
	}: AccordionRootProps = $props();

	const forwardedProps = $derived(restProps as Record<string, unknown>);

	function getSingleValue(): string {
		return typeof value === 'string' ? value : '';
	}

	function setSingleValue(nextValue: string): void {
		value = nextValue;
	}

	function getMultipleValue(): string[] {
		return Array.isArray(value) ? value : [];
	}

	function setMultipleValue(nextValue: string[]): void {
		value = nextValue;
	}
</script>

{#if type === 'single'}
	<AccordionPrimitive.Root
		bind:ref
		{...forwardedProps}
		bind:value={getSingleValue, setSingleValue}
		class={joinClassNames(accordionRootClass, className)}
		type="single"
	/>
{:else}
	<AccordionPrimitive.Root
		bind:ref
		{...forwardedProps}
		bind:value={getMultipleValue, setMultipleValue}
		class={joinClassNames(accordionRootClass, className)}
		type="multiple"
	/>
{/if}

<style>
	:global(.ui-accordion) {
		display: grid;
		gap: 0.45rem;
		min-width: 0;
	}
</style>
