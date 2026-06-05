/**
 * Purpose: public prop types for the local status-dot primitive.
 */
import type { HTMLAttributes } from 'svelte/elements';
import type { statusDotToneClassByTone } from './status-dot.svelte';

export type StatusDotTone = keyof typeof statusDotToneClassByTone;

export type StatusDotProps = HTMLAttributes<HTMLSpanElement> & {
	decorative?: boolean;
	label?: string;
	tone?: StatusDotTone;
};
