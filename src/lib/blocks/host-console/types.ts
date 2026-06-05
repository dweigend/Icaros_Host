/**
 * Purpose: public prop types for the composed host console block.
 */
import type { StationState } from '$lib/protocol';

export type HostConsoleConnection = Readonly<{
	httpOrigin: string;
	wsOrigin: string;
	questLaunchUrl: string;
	experienceTargetUrl: string | null;
}>;

export type HostConsoleProps = Readonly<{
	connection: HostConsoleConnection;
	station: StationState;
}>;
