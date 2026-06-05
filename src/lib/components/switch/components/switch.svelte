<!--
	Purpose: Switch wrapper for binary console settings, preserving Bits UI
	checked state and thumb structure.
-->
<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';

	import { switchControlClass, switchThumbClass } from '../switch.svelte';
	import type { SwitchProps } from '../types';

	let {
		checked = $bindable(false),
		description,
		disabled = false,
		label,
		...restProps
	}: SwitchProps = $props();
</script>

<label class="ui-switch">
	<span class="ui-switch__copy">
		<span class="ui-switch__label">{label}</span>
		{#if description}
			<span class="ui-switch__description">{description}</span>
		{/if}
	</span>
	<SwitchPrimitive.Root
		bind:checked
		class={switchControlClass}
		{disabled}
		{...restProps}
	>
		<SwitchPrimitive.Thumb class={switchThumbClass} />
	</SwitchPrimitive.Root>
</label>

<style>
	.ui-switch {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		color: var(--color-text);
	}

	.ui-switch__copy {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.ui-switch__label {
		font-size: 0.78rem;
		font-weight: 800;
		text-transform: uppercase;
		color: var(--color-text-strong);
	}

	.ui-switch__description {
		font-size: 0.76rem;
		color: var(--color-text-soft);
	}

	:global(.ui-switch__control) {
		position: relative;
		width: 2.45rem;
		height: 1.35rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 999px;
		background: var(--color-surface);
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
	}

	:global(.ui-switch__control[data-state='checked']) {
		border-color: var(--color-accent);
		background: var(--color-accent);
	}

	:global(.ui-switch__thumb) {
		display: block;
		width: 1rem;
		height: 1rem;
		border-radius: 999px;
		background: var(--color-text-strong);
		transform: translateX(0.15rem);
		transition: transform 120ms ease;
	}

	:global(.ui-switch__control[data-state='checked'] .ui-switch__thumb) {
		background: var(--color-accent-contrast);
		transform: translateX(1.2rem);
	}
</style>
