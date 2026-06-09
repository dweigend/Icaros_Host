/**
 * Purpose: friendly local bootstrap for Icaros Host. This script performs
 * preflight checks, builds the SvelteKit app, and then hands off to the runtime
 * server entrypoint.
 */
import { spawn } from 'node:child_process';

import {
	createRuntimeServerEnv,
	type HostBootstrapConfig,
	resolveHostBootstrapPorts
} from '../src/lib/server/startup/host-config';
import { ensureHostTlsFiles } from '../src/lib/server/startup/host-tls';

async function main(): Promise<void> {
	const startupMode = readStartupMode(process.argv.slice(2));
	const config = await resolveHostBootstrapPorts(process.env, startupMode);

	ensureHostTlsFiles({
		keyFile: config.tlsKeyFile,
		certFile: config.tlsCertFile
	});

	printBootstrapSummary(config, startupMode);
	await runCommand('bun', ['run', 'build']);
	await runCommand('bun', ['server/index.ts'], createRuntimeServerEnv(config));
}

function readStartupMode(args: readonly string[]): 'dynamic' | 'strict' {
	return args.includes('--strict') ? 'strict' : 'dynamic';
}

function printBootstrapSummary(
	config: HostBootstrapConfig,
	startupMode: ReturnType<typeof readStartupMode>
): void {
	console.log('Icaros Host start');
	console.log(`Port mode: ${startupMode}`);
	console.log(`Host: ${config.host}`);
	console.log(`HTTPS port: ${config.port}`);
	if (config.deviceWsOrigin !== '') {
		console.log(`M5 device WS origin: ${config.deviceWsOrigin}`);
	} else {
		console.log(`M5 plain WS port: ${config.deviceWsPort}`);
	}
	console.log(`TLS key: ${config.tlsKeyFile}`);
	console.log(`TLS cert: ${config.tlsCertFile}`);
	console.log('Launch target: selected registered runtime client HTTPS URL');
}

function runCommand(
	command: string,
	args: readonly string[],
	env: Record<string, string> = {}
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, [...args], {
			env: { ...process.env, ...env },
			stdio: 'inherit'
		});

		child.on('error', reject);
		child.on('close', (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(
				new Error(
					signal === null
						? `${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`
						: `${command} ${args.join(' ')} stopped with signal ${signal}`
				)
			);
		});
	});
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
