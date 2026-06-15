<!--
	Purpose: local Icaros Select wrapper around Bits UI Select.Root for compact
	single-value console forms.
-->
<script lang="ts">
	import { Check, ChevronDown } from '@lucide/svelte';
	import { Select as SelectPrimitive } from 'bits-ui';

	type SelectOption = Readonly<{
		value: string;
		label: string;
		disabled?: boolean;
	}>;

	type SelectProps = Readonly<{
		disabled?: boolean;
		items: SelectOption[];
		label: string;
		name?: string;
		placeholder?: string;
		value?: string;
	}>;

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
