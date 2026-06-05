/**
 * Purpose: public prop and option types for the local Select primitive.
 */
import type { Select } from 'bits-ui';
import type { HTMLAttributes } from 'svelte/elements';

export type SelectOption = Readonly<{
	disabled?: boolean;
	label: string;
	value: string;
}>;

export type SelectContentProps = Select.ContentProps;
export type SelectFieldProps = HTMLAttributes<HTMLDivElement> & {
	ariaLabel: string;
	contentClass?: string;
	disabled?: boolean;
	options: readonly SelectOption[];
	placeholder?: string;
	sideOffset?: number;
	triggerClass?: string;
	value?: string;
};
export type SelectItemProps = Select.ItemProps;
export type SelectPortalProps = Select.PortalProps;
export type SelectRootProps = Select.RootProps;
export type SelectTriggerProps = Select.TriggerProps;
export type SelectViewportProps = Select.ViewportProps;
