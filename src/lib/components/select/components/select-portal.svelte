<!--
	Purpose: Select portal wrapper that mirrors the official Bits UI API.
-->
<script lang="ts">
	import { Select as SelectPrimitive } from 'bits-ui';
	import type { SelectPortalProps } from '../types';

	let { ...restProps }: SelectPortalProps = $props();
</script>

<SelectPrimitive.Portal {...restProps} />
