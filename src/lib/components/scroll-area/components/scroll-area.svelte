<!--
	Purpose: ScrollArea wrapper based on the official Bits UI compound structure.
-->
<script lang="ts">
	import { ScrollArea as ScrollAreaPrimitive } from 'bits-ui';

	import {
		scrollAreaRootClass,
		scrollAreaScrollbarClass,
		scrollAreaThumbClass,
		scrollAreaViewportClass
	} from '../scroll-area.svelte';
	import type { ScrollAreaProps } from '../types';

	let {
		ref = $bindable(null),
		children,
		class: className = '',
		viewportClass = '',
		...restProps
	}: ScrollAreaProps = $props();
</script>

<ScrollAreaPrimitive.Root
	bind:ref
	{...restProps}
	class={[scrollAreaRootClass, className]}
>
	<ScrollAreaPrimitive.Viewport class={[scrollAreaViewportClass, viewportClass]}>
		{@render children?.()}
	</ScrollAreaPrimitive.Viewport>
	<ScrollAreaPrimitive.Scrollbar class={scrollAreaScrollbarClass} orientation="vertical">
		<ScrollAreaPrimitive.Thumb class={scrollAreaThumbClass} />
	</ScrollAreaPrimitive.Scrollbar>
	<ScrollAreaPrimitive.Scrollbar class={scrollAreaScrollbarClass} orientation="horizontal">
		<ScrollAreaPrimitive.Thumb class={scrollAreaThumbClass} />
	</ScrollAreaPrimitive.Scrollbar>
	<ScrollAreaPrimitive.Corner />
</ScrollAreaPrimitive.Root>

<style>
	:global(.ui-scroll-area) {
		position: relative;
		overflow: hidden;
		min-width: 0;
	}

	:global(.ui-scroll-area__viewport) {
		width: 100%;
		height: 100%;
		max-height: inherit;
	}

	:global(.ui-scroll-area__scrollbar) {
		display: flex;
		touch-action: none;
		user-select: none;
		padding: 1px;
		background: transparent;
	}

	:global(.ui-scroll-area__scrollbar[data-orientation='vertical']) {
		width: 0.55rem;
	}

	:global(.ui-scroll-area__scrollbar[data-orientation='horizontal']) {
		height: 0.55rem;
	}

	:global(.ui-scroll-area__thumb) {
		flex: 1;
		border-radius: 999px;
		background: var(--color-border-strong);
	}
</style>
