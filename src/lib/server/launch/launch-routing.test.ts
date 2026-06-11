/**
 * Purpose: focused tests for the Quest launch routing boundary so `/launch`
 * opens exactly the runtime client selected by the operator.
 */
import { describe, expect, it } from 'vitest';

import type { RuntimeClientSummary } from '$lib/protocol';
import { resolveLaunchClientUrl } from './launch-routing';

describe('resolveLaunchClientUrl', () => {
	it('requires a selected launch client', () => {
		expect(resolveLaunchClientUrl(null, null)).toEqual({
			ok: false,
			status: 409,
			message: 'No launch client is selected.'
		});
	});

	it('requires the selected runtime client to be online', () => {
		expect(resolveLaunchClientUrl('quest-client', null)).toEqual({
			ok: false,
			status: 409,
			message: 'The selected launch client is not online.'
		});

		expect(resolveLaunchClientUrl('quest-client', createClient({ status: 'stale' }))).toEqual({
			ok: false,
			status: 409,
			message: 'The selected launch client is not online.'
		});
	});

	it('redirects to the selected client HTTPS URL', () => {
		expect(
			resolveLaunchClientUrl(
				'quest-client',
				createClient({ url: 'https://quest.local:5174/experiences/echo-flight/?mode=vr' })
			)
		).toEqual({
			ok: true,
			url: 'https://quest.local:5174/experiences/echo-flight/?mode=vr'
		});
	});

	it('rejects selected launch client URLs that are not HTTPS', () => {
		expect(
			resolveLaunchClientUrl('quest-client', createClient({ url: 'http://quest.local/' }))
		).toEqual({
			ok: false,
			status: 500,
			message: 'Selected launch client URL must use https for Quest launch.'
		});
	});

	it('rejects invalid selected launch client URLs', () => {
		expect(resolveLaunchClientUrl('quest-client', createClient({ url: 'not a url' }))).toEqual({
			ok: false,
			status: 500,
			message: 'Selected launch client URL must be a valid HTTPS URL.'
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
