/**
 * Purpose: JSON adapter for LLM-oriented M5 pairing diagnostics.
 * Command parsing and workflow dispatch live in the shared pairing service.
 */
import { json } from '@sveltejs/kit';

import {
	getM5PairingStatus,
	parseM5PairingCommand,
	runM5PairingCommand
} from '$lib/server/device/pairing-service';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	return json(getM5PairingStatus(url));
};

export const POST: RequestHandler = async ({ request, url }) => {
	const command = parseM5PairingCommand(await request.json().catch(() => null));

	if (command === null) {
		return json({ ok: false, error: 'Invalid M5 pairing command.' }, { status: 400 });
	}

	const result = runM5PairingCommand(url, command);
	return json(result, { status: result.ok ? 200 : 400 });
};
