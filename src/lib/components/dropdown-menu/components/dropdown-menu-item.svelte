<!--
	Purpose: DropdownMenu item wrapper with shared menu item styling.
-->
<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';

	import { dropdownMenuItemClass } from '../dropdown-menu.svelte';
	import type { DropdownMenuItemProps } from '../types';

	type Props = DropdownMenuItemProps & {
		children?: Snippet;
	};

	let { ref = $bindable(null), class: className = '', children, textValue, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Item
	bind:ref
	{...restProps}
	{textValue}
	class={[dropdownMenuItemClass, className]}
>
	{#if children}
		{@render children()}
	{:else if textValue}
		<span>{textValue}</span>
	{/if}
</DropdownMenuPrimitive.Item>

<style>
	:global(.ui-menu-item) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 2rem;
		padding: 0 0.55rem;
		border-radius: 0.3rem;
		color: var(--color-text);
		font-size: 0.82rem;
		cursor: pointer;
		outline: none;
	}

	:global(.ui-menu-item[data-highlighted]) {
		color: var(--color-accent-contrast);
		background: var(--color-accent);
	}
</style>
