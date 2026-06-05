<!--
	Purpose: Tabs root that preserves Bits UI value binding and keyboard behavior.
-->
<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { tabsRootClass } from '../tabs.svelte';
	import type { TabsRootProps } from '../types';

	let {
		ref = $bindable(null),
		value = $bindable(''),
		class: className = '',
		...restProps
	}: TabsRootProps = $props();
</script>

<TabsPrimitive.Root
	bind:ref
	bind:value
	{...restProps}
	class={[tabsRootClass, className]}
/>

<style>
	:global(.ui-tabs) {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}
</style>
