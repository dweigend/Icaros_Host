<!--
	Purpose: local Icaros Select wrapper around Bits UI Select.Root for compact
	single-value console forms.
-->
<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';
	import { Select as SelectPrimitive } from 'bits-ui';

	import type { SelectProps } from '../types';

	let {
		disabled = false,
		items,
		label,
		name,
		placeholder = 'Select',
		value = $bindable('')
	}: SelectProps = $props();
</script>

<SelectPrimitive.Root
	type="single"
	bind:value
	{name}
	{disabled}
	items={items}
	allowDeselect={false}
>
	<SelectPrimitive.Trigger class="ui-select__trigger" aria-label={label}>
		<SelectPrimitive.Value {placeholder} />
		<ChevronDown size={16} aria-hidden="true" />
	</SelectPrimitive.Trigger>
	<SelectPrimitive.Portal>
		<SelectPrimitive.Content class="ui-select__content" sideOffset={4}>
			<SelectPrimitive.Viewport class="ui-select__viewport">
				{#each items as item (item.value)}
					<SelectPrimitive.Item
						class="ui-select__item"
						value={item.value}
						label={item.label}
						disabled={item.disabled}
					>
						{#snippet children({ selected })}
							<span>{item.label}</span>
							{#if selected}
								<Check size={16} aria-hidden="true" />
							{/if}
						{/snippet}
					</SelectPrimitive.Item>
				{/each}
			</SelectPrimitive.Viewport>
		</SelectPrimitive.Content>
	</SelectPrimitive.Portal>
</SelectPrimitive.Root>

<style>
	:global(.ui-select__trigger) {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: min(100%, 28rem);
		min-height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 0;
		color: var(--color-text-strong);
		background: var(--color-background);
		font: inherit;
		cursor: pointer;
	}

	:global(.ui-select__trigger:hover) {
		border-color: var(--color-accent);
	}

	:global(.ui-select__trigger:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	:global(.ui-select__trigger[data-disabled]) {
		cursor: not-allowed;
		opacity: 0.45;
	}

	:global(.ui-select__content) {
		z-index: 50;
		min-width: var(--bits-select-anchor-width);
		border: 1px solid var(--color-border-strong);
		border-radius: 0;
		color: var(--color-text);
		background: var(--color-surface-raised);
	}

	:global(.ui-select__viewport) {
		display: grid;
		gap: 0.15rem;
		padding: 0.25rem;
	}

	:global(.ui-select__item) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		min-height: 2rem;
		padding: 0 0.55rem;
		outline: none;
		cursor: pointer;
	}

	:global(.ui-select__item[data-highlighted]) {
		color: var(--color-accent-contrast);
		background: var(--color-accent);
	}

	:global(.ui-select__item[data-disabled]) {
		cursor: not-allowed;
		opacity: 0.45;
	}
</style>
