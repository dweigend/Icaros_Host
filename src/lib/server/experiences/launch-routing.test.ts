/**
 * Purpose: focused tests for the Quest launch routing boundary so active
 * experience redirects stay explicit and LAN-safe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveExperienceLaunchUrl } from './launch-routing';

describe('resolveExperienceLaunchUrl', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('maps the active experience to the same LAN host on the default client port', () => {
		expect(
			resolveExperienceLaunchUrl(
				'infinite-world-demo',
				new URL('https://192.168.50.194:5183/launch')
			)
		).toEqual({
			ok: true,
			url: 'https://192.168.50.194:5174/'
		});
	});

	it('requires an active experience', () => {
		expect(resolveExperienceLaunchUrl(null, new URL('https://192.168.50.194:5183/launch'))).toEqual(
			{
				ok: false,
				status: 409,
				message: 'No active experience is selected.'
			}
		);
	});

	it('supports explicit origin and path templates', () => {
		vi.stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'https://client.local:9443/');
		vi.stubEnv('ICAROS_EXPERIENCE_PATH', '/experiences/{experienceId}/');

		expect(
			resolveExperienceLaunchUrl('infinite-world-demo', new URL('https://host.local:5183/launch'))
		).toEqual({
			ok: true,
			url: 'https://client.local:9443/experiences/infinite-world-demo/'
		});
	});
});
