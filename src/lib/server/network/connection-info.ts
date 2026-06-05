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

export type ServerOpenUrl = Readonly<{
	label: 'Open locally' | 'Open on LAN' | 'Open at';
	url: string;
}>;

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

export function resolveServerOpenUrls(
	protocol: HttpProtocol,
	hostname: string,
	port: number
): readonly ServerOpenUrl[] {
	const portValue = String(port);

	if (hostname === '0.0.0.0') {
		return [
			{ label: 'Open locally', url: createHttpUrl(protocol, 'localhost', portValue) },
			...resolveLanIpv4Hostnames().map((lanHostname) => ({
				label: 'Open on LAN' as const,
				url: createHttpUrl(protocol, lanHostname, portValue)
			}))
		];
	}

	const label = isLocalHostname(hostname) ? 'Open locally' : 'Open at';
	return [{ label, url: createHttpUrl(protocol, hostname, portValue) }];
}

export function resolveLanHostname(hostname: string): string {
	if (!isLocalHostname(hostname)) {
		return hostname;
	}

	const [lanHostname] = resolveLanIpv4Hostnames();

	if (lanHostname !== undefined) {
		return lanHostname;
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

function resolveLanIpv4Hostnames(): readonly string[] {
	const hostnames: string[] = [];

	for (const addresses of Object.values(networkInterfaces())) {
		for (const address of addresses ?? []) {
			if (address.family === 'IPv4' && !address.internal) {
				hostnames.push(address.address);
			}
		}
	}

	return hostnames;
}

function createHttpUrl(protocol: HttpProtocol, hostname: string, port: string): string {
	return `${protocol}://${formatHost(hostname, port)}/`;
}
