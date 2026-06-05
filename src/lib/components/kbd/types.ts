/**
 * Purpose: public prop types for the local kbd primitive.
 */
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

export type KbdProps = HTMLAttributes<HTMLElement> & {
	children?: Snippet;
};
