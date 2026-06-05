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
