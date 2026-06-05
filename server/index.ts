/**
 * Purpose: production entrypoint that combines SvelteKit HTTP handling with the
 * Icaros WebSocket runtime. It owns process startup only; protocol and station
 * behavior stay in reusable server libraries.
 */
import { createServer } from 'node:http';

import { createIcarosWebSocketGateway } from '../src/lib/server/ws';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

async function start(): Promise<void> {
	const { handler } = await import('../build/handler.js');
	const server = createServer(handler);
	const gateway = createIcarosWebSocketGateway();

	gateway.attach(server);

	server.listen(port, host, () => {
		console.log(`Icaros Host listening on http://${host}:${port}`);
	});

	const stop = (): void => {
		gateway.dispose();
		server.close();
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

await start();
