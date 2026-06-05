/**
 * Purpose: public exports for the local Accordion primitive.
 */
export { default as Content } from './components/accordion-content.svelte';
export { default as Header } from './components/accordion-header.svelte';
export { default as Item } from './components/accordion-item.svelte';
export { default as Root } from './components/accordion-root.svelte';
export { default as Trigger } from './components/accordion-trigger.svelte';
export type {
	AccordionContentProps,
	AccordionHeaderProps,
	AccordionItemProps,
	AccordionRootProps,
	AccordionTriggerProps
} from './types';
