<!--
	Purpose: Select content using Bits UI child-snippet floating props.
-->
<script lang="ts">
	import { Select as SelectPrimitive, mergeProps, type WithoutChildrenOrChild } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import { fly } from 'svelte/transition';

	import { joinClassNames } from '$lib/utils/class-names';
	import { selectContentClass } from '../select.svelte';
	import type { SelectContentProps } from '../types';

	type Props = WithoutChildrenOrChild<SelectContentProps> & {
		children?: Snippet;
	};

	let { ref = $bindable(null), class: className = '', children, ...restProps }: Props = $props();
</script>

<SelectPrimitive.Content bind:ref {...restProps} forceMount={true}>
	{#snippet child({ props, wrapperProps, open })}
		{#if open}
			<div {...wrapperProps}>
				<div
					{...mergeProps(props, { class: joinClassNames(selectContentClass, className) })}
					transition:fly={{ y: -4, duration: 120 }}
				>
					{@render children?.()}
				</div>
			</div>
		{/if}
	{/snippet}
</SelectPrimitive.Content>

<style>
	:global(.ui-select-content) {
		z-index: 20;
		min-width: var(--bits-select-anchor-width);
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.35rem;
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: var(--color-surface-strong);
		box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.35);
	}
</style>
