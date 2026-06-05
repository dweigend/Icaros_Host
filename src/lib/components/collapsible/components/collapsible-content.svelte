<!--
	Purpose: Collapsible content wrapper with forceMount available through Bits UI.
-->
<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import { collapsibleContentClass } from '../collapsible.svelte';
	import type { CollapsibleContentProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: CollapsibleContentProps = $props();
</script>

<CollapsiblePrimitive.Content
	bind:ref
	{...restProps}
	class={joinClassNames(collapsibleContentClass, className)}
/>

<style>
	:global(.ui-collapsible__content) {
		min-width: 0;
		overflow: hidden;
		color: var(--color-text-soft);
	}
</style>
