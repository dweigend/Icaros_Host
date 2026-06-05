<!--
	Purpose: full-width Select composition for common console choice fields.
-->
<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';

	import { joinClassNames } from '$lib/utils/class-names';
	import type { SelectFieldProps } from '../types';
	import Content from './select-content.svelte';
	import Item from './select-item.svelte';
	import Portal from './select-portal.svelte';
	import Root from './select-root.svelte';
	import Trigger from './select-trigger.svelte';
	import Viewport from './select-viewport.svelte';

	let {
		ariaLabel,
		class: className = '',
		contentClass = '',
		disabled = false,
		options = [],
		placeholder = 'Select option',
		sideOffset = 8,
		triggerClass = '',
		value = $bindable(''),
		...restProps
	}: SelectFieldProps = $props();

	const selectedLabel = $derived(
		options.find((option) => option.value === value)?.label ?? placeholder
	);
	const forwardedOptions = $derived([...options]);
</script>

<div {...restProps} class={joinClassNames('ui-select-field', className)}>
	<Root bind:value items={forwardedOptions} type="single" {disabled}>
		<Trigger aria-label={ariaLabel} class={triggerClass} {disabled}>
			<span>{selectedLabel}</span>
			<ChevronDown aria-hidden="true" size={16} strokeWidth={2} />
		</Trigger>
		<Portal>
			<Content class={contentClass} {sideOffset}>
				<Viewport>
					{#each options as option (option.value)}
						<Item disabled={option.disabled} label={option.label} value={option.value} />
					{/each}
				</Viewport>
			</Content>
		</Portal>
	</Root>
</div>

<style>
	.ui-select-field {
		min-width: 0;
	}

	.ui-select-field :global(.ui-select-trigger span) {
		min-width: 0;
		overflow-wrap: anywhere;
		text-align: left;
	}
</style>
