<!--
	Purpose: Select viewport wrapper with shared stacked layout.
-->
<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import { selectViewportClass } from '../select.svelte';
	import type { SelectViewportProps } from '../types';

	let { ref = $bindable(null), class: className = '', ...restProps }: SelectViewportProps = $props();
</script>

<SelectPrimitive.Viewport bind:ref {...restProps} class={joinClassNames(selectViewportClass, className)} />

<style>
	:global(.ui-select-viewport) {
		display: grid;
		gap: 0.2rem;
	}
</style>
