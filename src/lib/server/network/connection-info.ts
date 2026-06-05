/**
 * Purpose: server-side network address helpers for local station URLs. The
 * module converts loopback requests into LAN-facing origins while keeping
 * protocol and port handling explicit at route boundaries.
 */
import { networkInterfaces } from 'node:os';

export type HostConnectionInfo = Readonly<{
	httpOrigin: string;
	wsOrigin: string;
	lanHostname: string;
}>;

export type HttpProtocol = 'http' | 'https';

export function resolveConnectionInfo(url: URL): HostConnectionInfo {
	const lanHostname = resolveLanHostname(url.hostname);
	const host = formatHost(lanHostname, url.port);
	const httpProtocol = readHttpProtocol(url.protocol);
	const wsProtocol = httpProtocol === 'https' ? 'wss' : 'ws';

	return {
		httpOrigin: `${httpProtocol}://${host}`,
		wsOrigin: `${wsProtocol}://${host}`,
		lanHostname
	};
}

export function resolveLanHostname(hostname: string): string {
	if (!isLocalHostname(hostname)) {
		return hostname;
	}

	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) {
				return address.address;
			}
		}
	}

	return 'localhost';
}

export function formatHost(hostname: string, port: string): string {
	const formattedHostname = hostname.includes(':') ? `[${hostname}]` : hostname;
	return port === '' ? formattedHostname : `${formattedHostname}:${port}`;
}

export function readHttpProtocol(protocol: string): HttpProtocol {
	return protocol === 'https:' || protocol === 'https' ? 'https' : 'http';
}

function isLocalHostname(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}
