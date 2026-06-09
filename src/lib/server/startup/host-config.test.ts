/**
 * Purpose: regression tests for Host bootstrap configuration so `bun start`
 * stays friendly without invoking device setup concerns.
 */
import { describe, expect, it } from 'vitest';

import {
	createRuntimeServerEnv,
	readHostBootstrapConfig,
	resolveHostBootstrapPorts
} from './host-config';

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

describe('resolveHostBootstrapPorts', () => {
	it('keeps defaults or moves them only in dynamic mode', async () => {
		await expect(resolveHostBootstrapPorts({}, 'dynamic', freeExcept())).resolves.toMatchObject({
			port: 5183,
			deviceWsPort: '5184'
		});
		await expect(
			resolveHostBootstrapPorts({}, 'dynamic', freeExcept(5183, 5184))
		).resolves.toMatchObject({
			port: 5185,
			deviceWsPort: '5186'
		});
		await expect(resolveHostBootstrapPorts({}, 'strict', freeExcept(5183))).rejects.toThrow(
			'PORT 5183 is already in use'
		);
	});

	it('never moves explicit ports in dynamic mode', async () => {
		await Promise.all([
			expect(
				resolveHostBootstrapPorts({ PORT: '5300' }, 'dynamic', freeExcept(5300))
			).rejects.toThrow('PORT 5300 is already in use'),
			expect(
				resolveHostBootstrapPorts({ ICAROS_DEVICE_WS_PORT: '5301' }, 'dynamic', freeExcept(5301))
			).rejects.toThrow('ICAROS_DEVICE_WS_PORT 5301 is already in use')
		]);
	});
});

function freeExcept(...ports: readonly number[]) {
	const occupiedPorts = new Set(ports);

	return async (_host: string, port: number): Promise<boolean> => !occupiedPorts.has(port);
}
