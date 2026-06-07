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

export type HttpProtocol = 'https';

export type ServerOpenUrl = Readonly<{
	label: 'Open locally' | 'Open on LAN' | 'Open at';
	url: string;
}>;

export function resolveConnectionInfo(url: URL): HostConnectionInfo {
	const lanHostname = resolveLanHostname(url.hostname);
	const host = formatHost(lanHostname, url.port);

	return {
		httpOrigin: `https://${host}`,
		wsOrigin: `wss://${host}`,
		lanHostname
	};
}

export function createQuestLaunchUrl(hostOrigin: string): string {
	const url = new URL('/launch', hostOrigin);
	url.protocol = 'https:';
	return url.toString();
}

export function resolveServerOpenUrls(
	protocol: HttpProtocol,
	hostname: string,
	port: number
): readonly ServerOpenUrl[] {
	const portValue = String(port);

	if (hostname === '0.0.0.0') {
		return [
			{
				label: readServerOpenLabel('local'),
				url: createHttpUrl(protocol, 'localhost', portValue)
			},
			...resolveLanIpv4Hostnames().map((lanHostname) => ({
				label: readServerOpenLabel('lan'),
				url: createHttpUrl(protocol, lanHostname, portValue)
			}))
		];
	}

	const label = readServerOpenLabel(isLocalHostname(hostname) ? 'local' : 'custom');
	return [{ label, url: createHttpUrl(protocol, hostname, portValue) }];
}

function resolveLanHostname(hostname: string): string {
	const normalizedHostname = normalizeHostname(hostname);

	if (!isLocalHostname(normalizedHostname)) {
		return normalizedHostname;
	}

	const [lanHostname] = resolveLanIpv4Hostnames();

	if (lanHostname !== undefined) {
		return lanHostname;
	}

	return 'localhost';
}

function formatHost(hostname: string, port: string): string {
	const normalizedHostname = normalizeHostname(hostname);
	const formattedHostname = normalizedHostname.includes(':')
		? `[${normalizedHostname}]`
		: normalizedHostname;
	return port === '' ? formattedHostname : `${formattedHostname}:${port}`;
}

function isLocalHostname(hostname: string): boolean {
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeHostname(hostname: string): string {
	if (hostname.startsWith('[') && hostname.endsWith(']')) {
		return hostname.slice(1, -1);
	}

	return hostname;
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

function readServerOpenLabel(target: 'local' | 'lan' | 'custom'): ServerOpenUrl['label'] {
	if (target === 'local') return 'Open locally';
	if (target === 'lan') return 'Open on LAN';
	return 'Open at';
}
