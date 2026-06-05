<!--
	Purpose: Collapsible root that preserves Bits UI open binding.
-->
<script lang="ts">
	import { Collapsible as CollapsiblePrimitive } from 'bits-ui';

	import { collapsibleRootClass } from '../collapsible.svelte';
	import type { CollapsibleRootProps } from '../types';

	let {
		ref = $bindable(null),
		open = $bindable(false),
		class: className = '',
		...restProps
	}: CollapsibleRootProps = $props();
</script>

<CollapsiblePrimitive.Root
	bind:ref
	bind:open
	{...restProps}
	class={[collapsibleRootClass, className]}
/>

<style>
	:global(.ui-collapsible) {
		display: grid;
		gap: 0.5rem;
		min-width: 0;
	}
</style>
