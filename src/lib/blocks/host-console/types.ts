/**
 * Purpose: public prop types for the composed host console block.
 */
import type { ExperienceManifest, StationState } from '$lib/protocol';

export type HostConsoleDiscovery = Readonly<{
	experiences: readonly ExperienceManifest[];
	errors: readonly string[];
	rootDir: string;
}>;

export type HostConsoleProps = Readonly<{
	discovery: HostConsoleDiscovery;
	station: StationState;
}>;
