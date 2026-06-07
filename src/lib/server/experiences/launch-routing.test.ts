/**
 * Purpose: focused tests for the Quest launch routing boundary so `/launch`
 * opens exactly the runtime client selected by the operator.
 */
import { describe, expect, it } from 'vitest';

import type { RuntimeClientSummary } from '$lib/protocol';
import { resolveExperienceLaunchUrl } from './launch-routing';

describe('resolveExperienceLaunchUrl', () => {
	it('requires an active runtime client selection', () => {
		expect(resolveExperienceLaunchUrl(null, null)).toEqual({
			ok: false,
			status: 409,
			message: 'No active runtime client is selected.'
		});
	});

	it('requires the selected runtime client to be online', () => {
		expect(resolveExperienceLaunchUrl('quest-client', null)).toEqual({
			ok: false,
			status: 409,
			message: 'The active runtime client is not online.'
		});

		expect(resolveExperienceLaunchUrl('quest-client', createClient({ status: 'stale' }))).toEqual({
			ok: false,
			status: 409,
			message: 'The active runtime client is not online.'
		});
	});

	it('redirects to the selected client HTTPS URL', () => {
		expect(
			resolveExperienceLaunchUrl(
				'quest-client',
				createClient({ url: 'https://quest.local:5174/experiences/echo-flight/?mode=vr' })
			)
		).toEqual({
			ok: true,
			url: 'https://quest.local:5174/experiences/echo-flight/?mode=vr'
		});
	});

	it('rejects active client URLs that are not HTTPS', () => {
		expect(
			resolveExperienceLaunchUrl('quest-client', createClient({ url: 'http://quest.local/' }))
		).toEqual({
			ok: false,
			status: 500,
			message: 'Active runtime client URL must use https for Quest launch.'
		});
	});

	it('rejects invalid active client URLs', () => {
		expect(resolveExperienceLaunchUrl('quest-client', createClient({ url: 'not a url' }))).toEqual({
			ok: false,
			status: 500,
			message: 'Active runtime client URL must be a valid HTTPS URL.'
		});
	});
});

function createClient(overrides: Partial<RuntimeClientSummary> = {}): RuntimeClientSummary {
	return {
		clientId: 'quest-client',
		experienceId: 'echo-flight',
		title: 'Echo Flight',
		url: 'https://quest.local:5174/',
		connectedAt: 1_000,
		lastSeenAt: 1_000,
		status: 'online',
		...overrides
	};
}
