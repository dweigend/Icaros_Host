/**
 * Purpose: regression tests for Host bootstrap configuration so `bun start`
 * stays friendly without invoking device setup concerns.
 */
import { describe, expect, it } from 'vitest';

import { createRuntimeServerEnv, readHostBootstrapConfig } from './host-config';

describe('readHostBootstrapConfig', () => {
	it('uses stable Host defaults for the friendly bootstrap path', () => {
		expect(readHostBootstrapConfig({})).toEqual({
			host: '0.0.0.0',
			port: 5183,
			deviceWsPort: '5184',
			deviceWsOrigin: '',
			tlsKeyFile: '.certs/icaros-host-key.pem',
			tlsCertFile: '.certs/icaros-host.pem'
		});
	});

	it('preserves explicit operator configuration', () => {
		expect(
			readHostBootstrapConfig({
				HOST: '127.0.0.1',
				PORT: '5300',
				ICAROS_DEVICE_WS_PORT: '5301',
				ICAROS_TLS_KEY_FILE: '.certs/custom-key.pem',
				ICAROS_TLS_CERT_FILE: '.certs/custom.pem'
			})
		).toEqual({
			host: '127.0.0.1',
			port: 5300,
			deviceWsPort: '5301',
			deviceWsOrigin: '',
			tlsKeyFile: '.certs/custom-key.pem',
			tlsCertFile: '.certs/custom.pem'
		});
	});

	it('rejects overlapping Host and plain device ports', () => {
		expect(() =>
			readHostBootstrapConfig({
				PORT: '5183',
				ICAROS_DEVICE_WS_PORT: '5183'
			})
		).toThrow('ICAROS_DEVICE_WS_PORT must differ from PORT');
	});

	it('allows disabling the plain device listener', () => {
		expect(readHostBootstrapConfig({ ICAROS_DEVICE_WS_PORT: 'none' }).deviceWsPort).toBe('none');
	});
});

describe('createRuntimeServerEnv', () => {
	it('passes only runtime server variables and not firmware update flags', () => {
		const env = createRuntimeServerEnv(readHostBootstrapConfig({}));

		expect(env).toEqual({
			HOST: '0.0.0.0',
			PORT: '5183',
			ICAROS_DEVICE_WS_PORT: '5184',
			ICAROS_DEVICE_WS_ORIGIN: '',
			ICAROS_TLS_KEY_FILE: '.certs/icaros-host-key.pem',
			ICAROS_TLS_CERT_FILE: '.certs/icaros-host.pem'
		});
		expect(env).not.toHaveProperty('ICAROS_ALLOW_M5_FIRMWARE_UPDATE');
	});
});
