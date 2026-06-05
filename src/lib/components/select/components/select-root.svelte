<!--
	Purpose: Select root that preserves the official Bits UI single/multiple
	value binding contract.
-->
<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { SelectRootProps } from '../types';

	let {
		type,
		open = $bindable(false),
		value = $bindable<string | string[] | undefined>(undefined),
		...restProps
	}: SelectRootProps = $props();

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
	<SelectPrimitive.Root
		{...forwardedProps}
		bind:open
		bind:value={getSingleValue, setSingleValue}
		type="single"
	/>
{:else}
	<SelectPrimitive.Root
		{...forwardedProps}
		bind:open
		bind:value={getMultipleValue, setMultipleValue}
		type="multiple"
	/>
{/if}
