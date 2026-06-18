/**
 * Purpose: narrow route-private entrypoint for the Host console page. Keep this
 * surface small so page code does not deep-import implementation modules.
 */

export { createConsolePageState } from './page-state.svelte';
