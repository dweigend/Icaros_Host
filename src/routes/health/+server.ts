/**
 * Purpose: small non-secret health endpoint for LAN and CLI diagnostics.
 *
 * The endpoint lets hardware setup tools prove that the Host is reachable on
 * the selected origin before a controller is provisioned with that URL.
 */
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json({
		ok: true,
		service: 'icaros-host',
		timestamp: new Date().toISOString()
	});
};
