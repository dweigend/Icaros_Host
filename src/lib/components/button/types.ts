/**
 * Purpose: public prop types for the local Bits UI button wrapper.
 */
import type { Button as ButtonPrimitive } from 'bits-ui';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'icon';

export type ButtonProps = ButtonPrimitive.RootProps & {
	size?: ButtonSize;
	variant?: ButtonVariant;
};
