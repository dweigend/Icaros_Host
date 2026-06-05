/**
 * Purpose: shared protocol types for Icaros Host messages. The file models the
 * small M1 contract between host, operator, Quest, experiences, and M5 without
 * transport-specific behavior.
 */
export const PROTOCOL_VERSION = 'neural-flight.v1';
export const STATION_ID = 'station-a';

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type StationId = typeof STATION_ID;

export type SourceRole = 'host' | 'operator' | 'quest' | 'experience' | 'm5';

export type MessageSource = Readonly<{
	role: SourceRole;
	id: string;
}>;

export type Message<TType extends string, TPayload> = Readonly<{
	protocol: ProtocolVersion;
	type: TType;
	stationId: StationId;
	source: MessageSource;
	timestamp: number;
	payload: TPayload;
}>;

export type StationState = Readonly<{
	activeExperienceId: string | null;
}>;

export type ExperienceMode = 'prototype' | 'production';
export type RequiredDevice = 'quest' | 'm5';

export type ExperienceManifest = Readonly<{
	id: string;
	title: string;
	entry: string;
	requiredDevices: readonly RequiredDevice[];
	protocol: ProtocolVersion;
	mode: ExperienceMode;
}>;

export type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	source: 'm5';
	safeMode: boolean;
	timestamp: number;
}>;

export type ClientRegisterPayload = Readonly<{
	role: 'operator' | 'quest' | 'experience';
	id: string;
	experienceId?: string;
}>;

export type OperatorSetActiveExperiencePayload = Readonly<{
	activeExperienceId: string | null;
}>;

export type ExperienceReadyPayload = Readonly<{
	experienceId: string;
}>;

export type StationStateMessage = Message<'station.state', StationState>;
export type ControlOrientationMessage = Message<'control.orientation', ControlOrientation>;
export type ClientRegisterMessage = Message<'client.register', ClientRegisterPayload>;
export type OperatorSetActiveExperienceMessage = Message<
	'operator.setActiveExperience',
	OperatorSetActiveExperiencePayload
>;
export type ExperienceReadyMessage = Message<'experience.ready', ExperienceReadyPayload>;
