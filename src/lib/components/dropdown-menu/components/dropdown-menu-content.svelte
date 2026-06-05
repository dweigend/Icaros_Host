<!--
	Purpose: DropdownMenu content wrapper using the official child-snippet
	pattern so floating-layer props and transitions remain owned by Bits UI.
-->
<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive, mergeProps, type WithoutChildrenOrChild } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';

	import { dropdownMenuContentClass } from '../dropdown-menu.svelte';
	import type { DropdownMenuContentProps } from '../types';

	type Props = WithoutChildrenOrChild<DropdownMenuContentProps> & {
		children?: Snippet;
	};

	let { ref = $bindable(null), class: className = '', children, ...restProps }: Props = $props();
</script>

<DropdownMenuPrimitive.Content bind:ref {...restProps} forceMount={true}>
	{#snippet child({ props, wrapperProps, open })}
		{#if open}
			<div {...wrapperProps}>
				<div
					{...mergeProps(props, { class: [dropdownMenuContentClass, className] })}
					transition:fly={{ y: -4, duration: 120 }}
				>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</DropdownMenuPrimitive.Content>

<style>
	:global(.ui-menu-content) {
		z-index: 20;
		display: grid;
		gap: 0.25rem;
		min-width: 12rem;
		padding: 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface-strong);
		box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.35);
	}
</style>
