<!--
	Purpose: Tabs content wrapper for mode-specific console panels.
-->
<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import { tabsContentClass } from '../tabs.svelte';
	import type { TabsContentProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: TabsContentProps = $props();
</script>

<TabsPrimitive.Content
	bind:ref
	{...restProps}
	class={joinClassNames(tabsContentClass, className)}
/>

<style>
	:global(.ui-tabs__content) {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	:global(.ui-tabs__content[hidden]) {
		display: none;
	}
</style>
