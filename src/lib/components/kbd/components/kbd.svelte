<!--
	Purpose: terminal command hint chip.
-->
<script lang="ts">
	import { joinClassNames } from '$lib/utils/class-names';
	import type { KbdProps } from '../types';

	let { children, class: className = '', ...restProps }: KbdProps = $props();
</script>

<kbd {...restProps} class={joinClassNames('ui-kbd', className)}>
	{@render children?.()}
</kbd>
