<!--
	Purpose: Tabs list wrapper with shared console styling.
-->
<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';

	import { tabsListClass } from '../tabs.svelte';
	import type { TabsListProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: TabsListProps = $props();
</script>

<TabsPrimitive.List bind:ref {...restProps} class={[tabsListClass, className]} />

<style>
	:global(.ui-tabs__list) {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		width: min(var(--content-max-width), 100%);
		margin: 0 auto;
		padding: 0.25rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
	}
</style>
