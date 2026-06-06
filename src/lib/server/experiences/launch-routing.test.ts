/**
 * Purpose: focused tests for the Quest launch routing boundary so active
 * experience redirects stay explicit and LAN-safe.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { createQuestLaunchUrl, resolveConnectionInfo } from '$lib/server/network';
import { resolveExperienceLaunchUrl } from './launch-routing';

describe('resolveExperienceLaunchUrl', () => {
	afterEach(() => {
		restoreEnv();
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
		stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'https');

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
		stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'https');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: true,
			url: 'https://192.168.50.194:5174/'
		});
	});

	it('treats blank routing environment values as unset', () => {
		stubEnv('ICAROS_EXPERIENCE_ORIGIN', ' ');
		stubEnv('ICAROS_EXPERIENCE_PROTOCOL', ' ');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message:
				'Quest launch requires an HTTPS experience target. Set ICAROS_EXPERIENCE_ORIGIN=https://... or ICAROS_EXPERIENCE_PROTOCOL=https.'
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
		stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'https://client.local:9443/');
		stubEnv('ICAROS_EXPERIENCE_PATH', '/experiences/{experienceId}/');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://host.local:5183/launch'))
		).toEqual({
			ok: true,
			url: 'https://client.local:9443/experiences/mountain-flight/'
		});
	});

	it('rejects explicit origins with paths', () => {
		stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'https://client.local:9443/base');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://host.local:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_ORIGIN must not include a path, query, or hash.'
		});
	});

	it('rejects network-relative experience paths', () => {
		stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'https://client.local:9443/');
		stubEnv('ICAROS_EXPERIENCE_PATH', '//evil.example/{experienceId}');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://host.local:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_PATH must start with a single /.'
		});
	});

	it('rejects explicit HTTP experience origins', () => {
		stubEnv('ICAROS_EXPERIENCE_ORIGIN', 'http://client.local:5174/');

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
		stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'http');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_PROTOCOL must be https for Quest launch.'
		});
	});

	it('rejects out-of-range experience ports', () => {
		stubEnv('ICAROS_EXPERIENCE_PROTOCOL', 'https');
		stubEnv('ICAROS_EXPERIENCE_PORT', '99999');

		expect(
			resolveExperienceLaunchUrl('mountain-flight', new URL('https://192.168.50.194:5183/launch'))
		).toEqual({
			ok: false,
			status: 500,
			message: 'ICAROS_EXPERIENCE_PORT must be a TCP port number.'
		});
	});
});

const originalEnv = new Map<string, string | undefined>();

function stubEnv(key: string, value: string): void {
	if (!originalEnv.has(key)) {
		originalEnv.set(key, process.env[key]);
	}

	process.env[key] = value;
}

function restoreEnv(): void {
	for (const [key, value] of originalEnv) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	originalEnv.clear();
}
