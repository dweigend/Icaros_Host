<!--
	Purpose: local Icaros separator wrapper around Bits UI Separator.Root.
-->
<script lang="ts">
	import { Separator as SeparatorPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import type { SeparatorProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: SeparatorProps = $props();
</script>

<SeparatorPrimitive.Root
	bind:ref
	{...restProps}
	class={joinClassNames('ui-separator', className)}
/>

<style>
	:global(.ui-separator) {
		width: min(var(--content-max-width), 100%);
		height: 1px;
		margin: 0.2rem auto;
		background: linear-gradient(
			90deg,
			transparent,
			var(--color-border-strong),
			var(--color-accent-muted),
			transparent
		);
	}
</style>
