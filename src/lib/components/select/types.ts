/**
 * Purpose: public prop types for the local Bits UI Select wrapper.
 */
export type SelectOption = Readonly<{
	value: string;
	label: string;
	disabled?: boolean;
}>;

export type SelectProps = Readonly<{
	disabled?: boolean;
	items: SelectOption[];
	label: string;
	name?: string;
	placeholder?: string;
	value?: string;
}>;
