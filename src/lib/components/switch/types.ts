/**
 * Purpose: public prop types for the local Switch primitive.
 */
import type { Switch as SwitchPrimitive } from 'bits-ui';

export type SwitchProps = SwitchPrimitive.RootProps & {
	description?: string;
	label: string;
};
