/**
 * Purpose: validate Host TLS certificate files before the runtime server starts.
 * Certificate creation remains a bootstrap concern and does not belong in
 * `server/index.ts`.
 */
import { existsSync } from 'node:fs';

export type HostTlsFiles = Readonly<{
	keyFile: string;
	certFile: string;
}>;

export function ensureHostTlsFiles(files: HostTlsFiles): void {
	if (existsSync(files.keyFile) && existsSync(files.certFile)) {
		return;
	}

	throw new Error(
		`Host requires HTTPS. Missing TLS files: key=${files.keyFile}, cert=${files.certFile}. Run the HTTPS setup before starting Icaros Host.`
	);
}
