/**
 * Purpose: testable model for the minimal Host-local M5 firmware protocol.
 *
 * The firmware itself is C++/PlatformIO, but these pure TypeScript helpers keep
 * the important URL, redaction, and diagnose payload rules executable in the
 * normal Host test suite. They intentionally mirror only stable protocol
 * invariants, not embedded runtime behavior.
 */

export type M5FirmwareWebSocketEndpoint = Readonly<{
	host: string;
	port: number;
	path: string;
}>;

export type M5FirmwareUrlParseResult =
	| Readonly<{ ok: true; endpoint: M5FirmwareWebSocketEndpoint }>
	| Readonly<{ ok: false; error: string }>;

export type M5FirmwareDiagnoseInput = Readonly<{
	firmwareVersion: string;
	deviceId: string;
	wifiStatus: number;
	localIp: string;
	rssi: number;
	serverUrl: string;
	webSocketConfigured: boolean;
	webSocketConnected: boolean;
	lastWebSocketError: string;
}>;

export type M5FirmwareDiagnosePayload = Readonly<{
	type: 'diagnoseResult';
	firmwareVersion: string;
	deviceId: string;
	wifiStatus: number;
	localIp: string;
	rssi: number;
	serverUrl: string;
	wsHost: string;
	wsPort: number;
	wsPath: string;
	webSocketConfigured: boolean;
	webSocketConnected: boolean;
	lastWebSocketError: string;
}>;

export function parseM5FirmwareWebSocketUrl(input: string): M5FirmwareUrlParseResult {
	const trimmed = input.trim();

	if (trimmed.startsWith('wss://')) {
		return { ok: false, error: 'wss URLs are not supported' };
	}

	if (!trimmed.startsWith('ws://')) {
		return { ok: false, error: 'URL must start with ws://' };
	}

	const withoutScheme = trimmed.slice('ws://'.length);
	const pathStart = withoutScheme.indexOf('/');
	const authority =
		pathStart >= 0 ? withoutScheme.slice(0, pathStart).trim() : withoutScheme.trim();
	const path = pathStart >= 0 ? withoutScheme.slice(pathStart).trim() : '/';

	if (authority === '') {
		return { ok: false, error: 'WebSocket host is missing' };
	}

	if (authority.startsWith('[') || authority.includes(']')) {
		return { ok: false, error: 'IPv6 hosts are not supported' };
	}

	const portStart = authority.lastIndexOf(':');
	const host = portStart >= 0 ? authority.slice(0, portStart).trim() : authority;
	const portText = portStart >= 0 ? authority.slice(portStart + 1) : '80';

	if (host === '') {
		return { ok: false, error: 'WebSocket host is missing' };
	}

	if (host.includes(':')) {
		return { ok: false, error: 'IPv6 hosts are not supported' };
	}

	const port = Number(portText);
	if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
		return { ok: false, error: 'WebSocket port is invalid' };
	}

	if (path === '' || !path.startsWith('/')) {
		return { ok: false, error: 'WebSocket path is invalid' };
	}

	return { ok: true, endpoint: { host, port, path } };
}

export function redactM5FirmwareServerUrl(input: string): string {
	try {
		const url = new URL(input);
		if (url.searchParams.has('pairing')) {
			url.searchParams.set('pairing', 'redacted');
		}
		return url.toString();
	} catch {
		return input.replace(/([?&]pairing=)[^&\s]+/g, '$1redacted');
	}
}

export function buildM5FirmwareDiagnosePayload(
	input: M5FirmwareDiagnoseInput
): M5FirmwareDiagnosePayload {
	const parsed = parseM5FirmwareWebSocketUrl(input.serverUrl);
	const parseError = parsed.ok ? '' : parsed.error;

	return {
		type: 'diagnoseResult',
		firmwareVersion: input.firmwareVersion,
		deviceId: input.deviceId,
		wifiStatus: input.wifiStatus,
		localIp: input.localIp,
		rssi: input.rssi,
		serverUrl: redactM5FirmwareServerUrl(input.serverUrl),
		wsHost: parsed.ok ? parsed.endpoint.host : '',
		wsPort: parsed.ok ? parsed.endpoint.port : 0,
		wsPath: parsed.ok ? redactM5FirmwareServerUrl(parsed.endpoint.path) : '',
		webSocketConfigured: input.webSocketConfigured,
		webSocketConnected: input.webSocketConnected,
		lastWebSocketError: input.lastWebSocketError || parseError
	};
}

export function validateM5FirmwareConfigureInput(
	input: Readonly<{ ssid?: string; serverUrl?: string; deviceId?: string }>
): Readonly<{ ok: true } | { ok: false; error: string }> {
	const ssid = readPresentString(input.ssid);
	const serverUrl = readPresentString(input.serverUrl);
	const deviceId = readPresentString(input.deviceId);

	if (ssid === null || serverUrl === null || deviceId === null) {
		return { ok: false, error: 'Missing ssid, serverUrl, or deviceId' };
	}

	const parsed = parseM5FirmwareWebSocketUrl(serverUrl);
	return parsed.ok ? { ok: true } : { ok: false, error: parsed.error };
}

function readPresentString(value: string | undefined): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed;
}
