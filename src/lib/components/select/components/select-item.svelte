<!--
	Purpose: Select item wrapper with selection indicator and data-state styling.
-->
<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import { joinClassNames } from '$lib/utils/class-names';
	import { selectItemClass } from '../select.svelte';
	import type { SelectItemProps } from '../types';

	type Props = SelectItemProps & {
		children?: Snippet<[{ highlighted: boolean; selected: boolean }]>;
	};

	let {
		ref = $bindable(null),
		class: className = '',
		children,
		label,
		value,
		...restProps
	}: Props = $props();
</script>

<SelectPrimitive.Item
	bind:ref
	{...restProps}
	{label}
	{value}
	class={joinClassNames(selectItemClass, className)}
>
	{#snippet children(snippetProps)}
		{#if children}
			{@render children(snippetProps)}
		{:else}
			<span>{label ?? value}</span>
			{#if snippetProps.selected}
				<Check aria-hidden="true" size={14} strokeWidth={2.2} />
			{/if}
		{/if}
	{/snippet}
</SelectPrimitive.Item>

<style>
	:global(.ui-select-item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2rem;
		min-width: 0;
		padding: 0 0.55rem;
		border-radius: 0.3rem;
		color: var(--color-text);
		font-size: 0.82rem;
		cursor: pointer;
		outline: none;
	}

	:global(.ui-select-item span) {
		overflow-wrap: anywhere;
	}

	:global(.ui-select-item[data-highlighted]) {
		color: var(--color-accent-contrast);
		background: var(--color-accent);
	}
</style>
