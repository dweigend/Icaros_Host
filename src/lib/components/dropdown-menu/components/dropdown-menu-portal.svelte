<!--
	Purpose: DropdownMenu portal wrapper that mirrors the official Bits UI API.
-->
<script lang="ts">
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
	import type { DropdownMenuPortalProps } from '../types';

	let { ...restProps }: DropdownMenuPortalProps = $props();
</script>

<DropdownMenuPrimitive.Portal {...restProps} />
