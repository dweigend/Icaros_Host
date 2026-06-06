/**
 * Purpose: message factory helpers for host-originated runtime frames. They keep
 * the shared envelope consistent without hiding transport decisions.
 */
import {
	type ClientRegisteredMessage,
	type ClientRegisteredPayload,
	type ClientRejectedMessage,
	type ClientRejectedPayload,
	type ControlOrientation,
	type ControlOrientationMessage,
	type Message,
	type MessageSource,
	PROTOCOL_VERSION,
	type RuntimeClientsMessage,
	type RuntimeClientsPayload,
	STATION_ID,
	type StationState,
	type StationStateMessage
} from './types';

const HOST_SOURCE: MessageSource = {
	role: 'host',
	id: 'icaros-host'
};

export function createMessage<TType extends string, TPayload>(
	type: TType,
	payload: TPayload,
	source: MessageSource = HOST_SOURCE
): Message<TType, TPayload> {
	return {
		protocol: PROTOCOL_VERSION,
		type,
		stationId: STATION_ID,
		source,
		timestamp: Date.now(),
		payload
	};
}

export function createStationStateMessage(state: StationState): StationStateMessage {
	return createMessage('station.state', state);
}

export function createControlOrientationMessage(
	control: ControlOrientation
): ControlOrientationMessage {
	return createMessage('control.orientation', control);
}

export function createClientRegisteredMessage(
	payload: ClientRegisteredPayload
): ClientRegisteredMessage {
	return createMessage('client.registered', payload);
}

export function createClientRejectedMessage(payload: ClientRejectedPayload): ClientRejectedMessage {
	return createMessage('client.rejected', payload);
}

export function createRuntimeClientsMessage(payload: RuntimeClientsPayload): RuntimeClientsMessage {
	return createMessage('runtime.clients', payload);
}
