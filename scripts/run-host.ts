/**
 * Purpose: cross-platform Host launcher for npm-style scripts that need to set
 * environment values before server startup.
 *
 * Context: Windows shells do not support POSIX inline env assignment like
 * `PORT=5183 HOST=0.0.0.0 bun server/index.ts`.
 * Responsibility: parse a tiny stable option set, write process.env, and then
 * delegate to the real server entrypoint.
 * Boundaries: This file must not duplicate server startup or runtime behavior.
 */

type HostLaunchConfig = Readonly<{
	host?: string;
	port?: string;
}>;

const config = readHostLaunchConfig(process.argv.slice(2));
if (config.host !== undefined) {
	process.env.HOST = config.host;
}
if (config.port !== undefined) {
	process.env.PORT = config.port;
}

await import('../server/index.ts');

function readHostLaunchConfig(args: readonly string[]): HostLaunchConfig {
	const config: { host?: string; port?: string } = {};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		const next = args[index + 1];

		if (arg === '--host' && next !== undefined) {
			config.host = next;
			index += 1;
			continue;
		}

		if (arg === '--port' && next !== undefined) {
			config.port = next;
			index += 1;
			continue;
		}

		throw new Error(`Unknown or incomplete run-host argument: ${arg}`);
	}

	return config;
}
