/**
 * Purpose: small shared URL helpers for browser clients that connect to the
 * Host over WSS. This keeps client helpers concrete without repeating origin
 * validation in every file.
 */
export type BrowserSocketOrigin = string | URL;

export function resolveBrowserSocketUrl(options: {
	path: string;
	label: string;
	origin?: BrowserSocketOrigin;
	fallbackHost: string;
}): string {
	const path = normalizeSocketPath(options.path);
	if (options.origin === undefined) {
		return `wss://${options.fallbackHost}${path}`;
	}

	const origin = readOrigin(options.label, options.origin);
	if (origin.protocol === 'http:' || origin.protocol === 'ws:') {
		throw new Error(`${options.label} must not use http or ws for browser sockets.`);
	}

	if (origin.protocol !== 'https:' && origin.protocol !== 'wss:') {
		throw new Error(`${options.label} must use https or wss for browser sockets.`);
	}

	origin.protocol = 'wss:';
	return new URL(path, origin).toString();
}

export function readHttpsConsoleUrl(origin: BrowserSocketOrigin | undefined): URL {
	if (origin === undefined) {
		return new URL('/', window.location.href);
	}

	const url = readOrigin('Host origin', origin);
	url.protocol = 'https:';
	url.pathname = '/';
	return url;
}

function normalizeSocketPath(path: string): string {
	const trimmed = path.trim();
	if (trimmed === '' || !trimmed.startsWith('/') || trimmed.startsWith('//')) {
		throw new Error('Socket path must be an absolute Host path.');
	}

	return trimmed;
}

function readOrigin(label: string, value: BrowserSocketOrigin): URL {
	try {
		const origin = new URL(value.toString());
		if (origin.pathname !== '/' || origin.search !== '' || origin.hash !== '') {
			throw new Error(`${label} must be an origin without path, search, or hash.`);
		}

		return origin;
	} catch (error) {
		if (error instanceof Error && error.message.startsWith(label)) {
			throw error;
		}

		throw new Error(`${label} must be a valid URL origin.`);
	}
}
