<!--
	Purpose: Tabs trigger wrapper styled through Bits UI data-state attributes.
-->
<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import { tabsTriggerClass } from '../tabs.svelte';
	import type { TabsTriggerProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: TabsTriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	{...restProps}
	class={joinClassNames(tabsTriggerClass, className)}
/>

<style>
	:global(.ui-tabs__trigger) {
		min-height: 2rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 0.35rem;
		color: var(--color-text-soft);
		background: transparent;
		font: inherit;
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		cursor: pointer;
	}

	:global(.ui-tabs__trigger[data-state='active']) {
		color: var(--color-accent-contrast);
		background: var(--color-accent);
	}
</style>
