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
	activeClientId: string | null;
}>;

export type ControlOrientation = Readonly<{
	pitch: number;
	roll: number;
	quality: number;
	source: 'm5';
	safeMode: boolean;
	timestamp: number;
}>;

export type OperatorDiagnosticRegistrationPayload = Readonly<{
	id: string;
}>;

export type RuntimeClientStatus = 'online' | 'stale';

export type RuntimeClientSummary = Readonly<{
	clientId: string;
	experienceId: string;
	title: string;
	url: string;
	userAgent?: string;
	connectedAt: number;
	lastSeenAt: number;
	status: RuntimeClientStatus;
}>;

export type ClientHelloPayload = Readonly<{
	role: 'experience';
	clientId: string;
	experienceId: string;
	title: string;
	url: string;
	userAgent?: string;
}>;

export type ClientHeartbeatPayload = Readonly<{
	clientId: string;
}>;

export type ClientRegisteredPayload = Readonly<{
	clientId: string;
	active: boolean;
	activeClientId: string | null;
}>;

export type ClientRejectedPayload = Readonly<{
	reason: string;
}>;

export type RuntimeClientsPayload = Readonly<{
	activeClientId: string | null;
	clients: readonly RuntimeClientSummary[];
}>;

export type StationStateMessage = Message<'station.state', StationState>;
export type ControlOrientationMessage = Message<'control.orientation', ControlOrientation>;
export type ClientRegisteredMessage = Message<'client.registered', ClientRegisteredPayload>;
export type ClientRejectedMessage = Message<'client.rejected', ClientRejectedPayload>;
export type RuntimeClientsMessage = Message<'runtime.clients', RuntimeClientsPayload>;
