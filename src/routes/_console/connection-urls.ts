/**
 * Purpose: derive browser-facing connection URLs for the Host console from
 * server load data. SSR fallbacks stay explicit for SvelteKit rendering.
 */
import type { PageData } from '../$types';
import type { HostConsoleConnectionUrls } from './types';

export function createConsoleConnectionUrls(
	connection: PageData['connection']
): HostConsoleConnectionUrls {
	return {
		consoleUrl: `${connection.httpOrigin}/`,
		questLaunchUrl: connection.questLaunchUrl,
		experienceTargetUrl: connection.experienceTargetUrl,
		m5SocketUrl: connection.pairedDeviceUrl,
		controlSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/control/main'),
		runtimeSocketUrl: createBrowserSocketUrl(connection.wsOrigin, '/ws/runtime')
	};
}

function createBrowserSocketUrl(fallbackWsOrigin: string, path: string): string {
	if (typeof window === 'undefined') {
		return `${fallbackWsOrigin}${path}`;
	}

	return `wss://${window.location.host}${path}`;
}
