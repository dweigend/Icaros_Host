<!--
	Purpose: local Icaros button wrapper around Bits UI Button.Root. It keeps the
	official button/link behavior and adds only terminal console classes.
-->
<script lang="ts">
	import { Button as ButtonPrimitive } from 'bits-ui';

	import { joinClassNames } from '$lib/utils/class-names';
	import type { ButtonProps } from '../types';

	let {
		children,
		class: className = '',
		size = 'md',
		variant = 'secondary',
		...restProps
	}: ButtonProps = $props();
</script>

<ButtonPrimitive.Root
	{...restProps}
	class={joinClassNames('ui-button', `ui-button--${variant}`, size !== 'md' && `ui-button--${size}`, className)}
>
	{@render children?.()}
</ButtonPrimitive.Root>
