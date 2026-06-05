/**
 * Purpose: message factory helpers for host-originated runtime frames. They keep
 * the shared envelope consistent without hiding transport decisions.
 */
import {
	type ControlOrientation,
	type ControlOrientationMessage,
	type Message,
	type MessageSource,
	PROTOCOL_VERSION,
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
