/**
 * Purpose: focused tests for the Quest launch routing boundary so active
 * experience redirects stay explicit and LAN-safe.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createQuestLaunchUrl, resolveConnectionInfo } from '$lib/server/network';
import { resolveExperienceLaunchUrl } from './launch-routing';

describe('resolveExperienceLaunchUrl', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('requires an explicit HTTPS experience target', () => {
		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message:
				'Quest launch requires an HTTPS experience target. Set ICAROS_EXPERIENCE_ORIGIN=https://... or ICAROS_EXPERIENCE_PROTOCOL=https.'
		});
	});

	it('keeps Host launch and experience target URLs on their own origins', () => {
		vi.stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'https');

		const requestUrl = new URL('https://192.168.50.194:5183/launch');
		const connection = resolveConnectionInfo(requestUrl);
		const questLaunchUrl = createQuestLaunchUrl(connection.httpOrigin);
		const experienceTarget = resolveExperienceLaunchUrl('mountain-flight', requestUrl);

		expect(questLaunchUrl).toBe('https://192.168.50.194:5183/launch');
		expect(questLaunchUrl).not.toBe('https://192.168.50.194:5174/launch');
		expect(experienceTarget).toEqual({
			ok: true,
			url: 'https://192.168.50.194:5174/'
		});
	});

	it('supports an explicit HTTPS experience protocol when the client runs TLS', () => {
		vi.stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'https');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
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
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://host.local:5183/launch'))
		).toEqual({
			ok: true,
			url: 'https://client.local:9443/experiences/mountain-flight/'
		});
	});

	it('rejects explicit HTTP experience origins', () => {
		vi.stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'http://client.local:5174/');

		const requestUrl = new URL('https://host.local:5183/launch');
		const connection = resolveConnectionInfo(requestUrl);

		expect(createQuestLaunchUrl(connection.httpOrigin)).toBe('https://host.local:5183/launch');
		expect(resolveExperienceLaunchUrl('mountain-flight', requestUrl)).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_ORIGIN must use https for Quest launch.'
		});
	});

	it('rejects explicit HTTP experience protocol', () => {
		vi.stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'http');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_PROTOCOL must be https for Quest launch.'
		});
	});
});
