/**
 * Purpose: executable protocol checks for the minimal Host-local M5 firmware so
 * embedded-only behavior still has a normal Host test safety net.
 */
import { describe, expect, it } from 'vitest';

import {
	buildM5FirmwareDiagnosePayload,
	parseM5FirmwareWebSocketUrl,
	redactM5FirmwareServerUrl,
	validateM5FirmwareConfigureInput
} from './m5-firmware-protocol';

describe('parseM5FirmwareWebSocketUrl', () => {
	it('parses the plain Host device WebSocket URL', () => {
		expect(parseM5FirmwareWebSocketUrl('ws://192.168.50.194:5184/ws/device?pairing=abc')).toEqual({
			ok: true,
			endpoint: {
				host: '192.168.50.194',
				port: 5184,
				path: '/ws/device?pairing=abc'
			}
		});
	});

	it('rejects wss URLs because the MVP firmware is plain ws only', () => {
		expect(parseM5FirmwareWebSocketUrl('wss://192.168.50.194:5183/ws/device')).toEqual({
			ok: false,
			error: 'wss URLs are not supported'
		});
	});

	it('rejects bracketed IPv6 hosts', () => {
		expect(parseM5FirmwareWebSocketUrl('ws://[::1]:5184/ws/device')).toEqual({
			ok: false,
			error: 'IPv6 hosts are not supported'
		});
	});
});

describe('redactM5FirmwareServerUrl', () => {
	it('redacts the pairing token without hiding host, port, or path', () => {
		expect(redactM5FirmwareServerUrl('ws://192.168.50.194:5184/ws/device?pairing=abc')).toBe(
			'ws://192.168.50.194:5184/ws/device?pairing=redacted'
		);
	});
});

describe('buildM5FirmwareDiagnosePayload', () => {
	it('includes parsed endpoint fields and redacted server URL', () => {
		expect(
			buildM5FirmwareDiagnosePayload({
				firmwareVersion: '0.2.0-test',
				deviceId: 'icaros-station-a-m5',
				wifiStatus: 3,
				localIp: '192.168.50.172',
				rssi: -51,
				serverUrl: 'ws://192.168.50.194:5184/ws/device?pairing=abc',
				webSocketConfigured: true,
				webSocketConnected: false,
				lastWebSocketError: ''
			})
		).toMatchObject({
			type: 'diagnoseResult',
			serverUrl: 'ws://192.168.50.194:5184/ws/device?pairing=redacted',
			wsHost: '192.168.50.194',
			wsPort: 5184,
			wsPath: '/ws/device?pairing=redacted',
			webSocketConfigured: true,
			webSocketConnected: false,
			lastWebSocketError: ''
		});
	});
});

describe('validateM5FirmwareConfigureInput', () => {
	it('accepts the minimal Host pairing config', () => {
		expect(
				validateM5FirmwareConfigureInput({
					ssid: 'test-wifi',
					serverUrl: 'ws://192.168.50.194:5184/ws/device?pairing=abc',
					deviceId: 'icaros-station-a-m5'
				})
		).toEqual({ ok: true });
	});

	it('rejects missing required configure fields', () => {
		expect(
				validateM5FirmwareConfigureInput({
					ssid: 'test-wifi',
					serverUrl: 'ws://192.168.50.194:5184/ws/device?pairing=abc'
				})
		).toEqual({
			ok: false,
			error: 'Missing ssid, serverUrl, or deviceId'
		});
	});
});
