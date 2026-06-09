<!--
	Purpose: local Icaros button wrapper around Bits UI Button.Root. It keeps the
	official button/link behavior and adds only terminal console classes.
-->
<script lang="ts">
	import { Button as ButtonPrimitive } from 'bits-ui';

	import type { ButtonProps } from '../types';

	let {
		children,
		class: className = '',
		ref = $bindable(null),
		size = 'md',
		variant = 'secondary',
		...restProps
	}: ButtonProps = $props();
</script>

<ButtonPrimitive.Root
	bind:ref
	{...restProps}
	class={['ui-button', `ui-button--${variant}`, size !== 'md' && `ui-button--${size}`, className]}
>
	{@render children?.()}
</ButtonPrimitive.Root>

<style>
	:global(.ui-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		min-height: 2.25rem;
		padding: 0 0.85rem;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-none);
		color: var(--color-text);
		background: var(--color-surface-raised);
		font-weight: 700;
		text-decoration: none;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			background-color 120ms ease,
			color 120ms ease;
	}

	:global(.ui-button:hover) {
		border-color: var(--color-accent);
		color: var(--color-text-strong);
	}

	:global(.ui-button:focus-visible) {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	:global(.ui-button:disabled),
	:global(.ui-button[aria-disabled='true']) {
		cursor: not-allowed;
		opacity: 0.45;
	}

	:global(.ui-button--primary) {
		color: var(--color-accent-contrast);
		background: var(--color-accent);
		border-color: var(--color-accent);
	}

	:global(.ui-button--secondary) {
		background: var(--color-surface-raised);
	}

	:global(.ui-button--ghost) {
		background: transparent;
		border-color: var(--color-border);
	}

	:global(.ui-button--icon) {
		width: 2.25rem;
		height: 2.25rem;
		min-height: 2.25rem;
		padding: 0;
		line-height: 1;
	}
</style>
