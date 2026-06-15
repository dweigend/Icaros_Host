/**
 * Purpose: focused checks for TLS preflight validation used by Host bootstrap.
 */
import { existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
	existsSync: vi.fn()
}));

import { ensureHostTlsFiles } from './host-tls';

const existsSyncMock = vi.mocked(existsSync);

describe('ensureHostTlsFiles', () => {
	it('accepts an existing key and certificate pair', () => {
		existsSyncMock.mockReturnValue(true);

		expect(() =>
			ensureHostTlsFiles({
				keyFile: '.certs/icaros-host-key.pem',
				certFile: '.certs/icaros-host.pem'
			})
		).not.toThrow();
	});

	it('fails clearly when TLS files are missing', () => {
		existsSyncMock.mockReturnValue(false);

		expect(() =>
			ensureHostTlsFiles({
				keyFile: '.certs/icaros-host-key.pem',
				certFile: '.certs/icaros-host.pem'
			})
		).toThrow('Host requires HTTPS. Missing TLS files');
	});
});
