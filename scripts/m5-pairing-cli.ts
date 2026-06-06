/**
 * Purpose: local operator CLI for M5 USB/WLAN pairing diagnostics.
 *
 * The CLI is the LLM automation adapter. It talks to the Host's JSON pairing
 * endpoint, while the human web UI talks to Svelte actions. Both transports use
 * the same server-side pairing service.
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import WebSocket from 'ws';

import type { M5PairingStatusView } from '../src/lib/server/device/pairing-service';
import type { PairingDebugLine, UsbSetupSnapshot } from '../src/lib/server/device/usb-setup';
import { resolveConnectionInfo } from '../src/lib/server/network';

const DEFAULT_HOST_ORIGIN = 'https://localhost:5183';
const DEFAULT_DEVICE_ID = 'icaros-station-a-m5';
const DEFAULT_TIMEOUT_MS = 125_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const PAIRING_API_PATH = '/api/m5-pairing';
const execFileAsync = promisify(execFile);

type Command =
	| 'help'
	| 'env'
	| 'info'
	| 'lan'
	| 'url'
	| 'snapshot'
	| 'checklist'
	| 'debug-on'
	| 'health'
	| 'pair'
	| 'probe'
	| 'flash'
	| 'abort'
	| 'protocols';

type CliConfig = Readonly<{
	command: Command;
	hostOrigin: URL;
	ssid: string | null;
	password: string | null;
	deviceId: string;
	staticIp: string | null;
	gateway: string | null;
	subnet: string | null;
	dns: string | null;
	timeoutMs: number;
	pollIntervalMs: number;
	insecureTls: boolean;
	showSensitive: boolean;
	skipLan: boolean;
	lanOrigin: URL | null;
}>;

type ProtocolCheck = Readonly<{
	label: string;
	url: string;
	expect: 'open' | 'reject';
	protocols?: readonly string[];
}>;

loadLocalEnv();

const config = readCliConfig(process.argv.slice(2));
if (config.insecureTls) {
	process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

try {
	await run(config);
} catch (error) {
	console.error(formatCliError(error));
	process.exitCode = 1;
}

async function run(config: CliConfig): Promise<void> {
	if (config.command === 'env') {
		printEnvironment(config);
		return;
	}

	if (config.command === 'help') {
		printHelp();
		return;
	}

	if (config.command === 'info') {
		printEnvironment(config);
		await printPairingUrl(config);
		return;
	}

	if (config.command === 'lan') {
		await runLanDiagnostics(config);
		return;
	}

	if (config.command === 'url') {
		await printPairingUrl(config);
		return;
	}

	if (config.command === 'snapshot') {
		printSnapshot(await readPairingStatus(config));
		return;
	}

	if (config.command === 'checklist') {
		printChecklist((await readPairingStatus(config)).usbSetup);
		return;
	}

	if (config.command === 'debug-on') {
		await setPairingDebug(config, true);
		console.log('pairingDebug=enabled');
		return;
	}

	if (config.command === 'health') {
		await runHealthCheck(config);
		return;
	}

	if (config.command === 'protocols') {
		await runProtocolChecks(config);
		return;
	}

	if (config.command === 'probe') {
		await runProbe(config);
		return;
	}

	if (config.command === 'flash') {
		await runFlash(config);
		return;
	}

	if (config.command === 'abort') {
		await postPairingCommand(config, { action: 'abortUsb' });
		console.log('abort=sent');
		return;
	}

	await runPairing(config);
}

function loadLocalEnv(): void {
	const envPath = resolve(process.cwd(), '.env');
	if (!existsSync(envPath)) {
		return;
	}

	for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed === '' || trimmed.startsWith('#')) {
			continue;
		}

		const separator = trimmed.indexOf('=');
		if (separator <= 0) {
			continue;
		}

		const key = trimmed.slice(0, separator).trim();
		const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
		process.env[key] ??= value;
	}
}

function unquoteEnvValue(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}

	return value;
}

function readCliConfig(args: readonly string[]): CliConfig {
	const command = readCommand(args[0]);
	const options = parseOptions(args.slice(command === null ? 0 : 1));
	const hostOrigin = new URL(
		readOption(options, 'host-origin') ?? process.env.ICAROS_M5_HOST_ORIGIN ?? DEFAULT_HOST_ORIGIN
	);

	return {
		command: command ?? 'env',
		hostOrigin,
		ssid: readOption(options, 'ssid') ?? process.env.ICAROS_M5_WIFI_SSID ?? null,
		password: readOption(options, 'password') ?? process.env.ICAROS_M5_WIFI_PASSWORD ?? null,
		deviceId:
			readOption(options, 'device-id') ?? process.env.ICAROS_M5_DEVICE_ID ?? DEFAULT_DEVICE_ID,
		staticIp: readOption(options, 'static-ip') ?? process.env.ICAROS_M5_STATIC_IP ?? null,
		gateway: readOption(options, 'gateway') ?? process.env.ICAROS_M5_GATEWAY ?? null,
		subnet: readOption(options, 'subnet') ?? process.env.ICAROS_M5_SUBNET ?? null,
		dns: readOption(options, 'dns') ?? process.env.ICAROS_M5_DNS ?? null,
		timeoutMs: readInteger(readOption(options, 'timeout-ms'), DEFAULT_TIMEOUT_MS),
		pollIntervalMs: readInteger(readOption(options, 'poll-ms'), DEFAULT_POLL_INTERVAL_MS),
		insecureTls: !options.has('strict-tls'),
		showSensitive: options.has('show-sensitive'),
		skipLan: options.has('skip-lan'),
		lanOrigin: readUrlOption(options, 'lan-origin')
	};
}

function readCommand(value: string | undefined): Command | null {
	if (
		value === 'env' ||
		value === 'info' ||
		value === 'lan' ||
		value === 'help' ||
		value === 'url' ||
		value === 'snapshot' ||
		value === 'checklist' ||
		value === 'debug-on' ||
		value === 'health' ||
		value === 'pair' ||
		value === 'probe' ||
		value === 'flash' ||
		value === 'abort' ||
		value === 'protocols'
	) {
		return value;
	}

	return null;
}

function printHelp(): void {
	console.log('Usage: bun run m5:pairing -- <command> [options]');
	console.log('');
	console.log('Commands:');
	console.log('  info       Show redacted environment and generated pairing URL.');
	console.log('  lan        Print non-secret LAN diagnostics for M5 reachability.');
	console.log('  url        Show only the redacted generated pairing URL.');
	console.log('  snapshot   Print the bounded pairing debug snapshot.');
	console.log('  checklist  Print the LLM-readable controller setup checklist.');
	console.log('  debug-on   Enable Host pairing debug mode through the web action.');
	console.log('  health     Check Host /health locally and on the selected LAN origin.');
	console.log('  protocols  Check /ws/runtime and paired /ws/device reachability.');
	console.log('  probe      Probe USB controller presence and firmware without writing config.');
	console.log('  flash      Upload local M5 firmware through the Host pairing service.');
	console.log('  abort      Abort the running USB probe, flash, or setup workflow.');
	console.log('  pair       Start USB setup through the same action as the web console.');
	console.log('');
	console.log('Options:');
	console.log(
		'  --host-origin <url>   Host origin, default ICAROS_M5_HOST_ORIGIN or https://localhost:5183.'
	);
	console.log('  --ssid <name>         WLAN SSID, default ICAROS_M5_WIFI_SSID from .env.');
	console.log('  --password <value>    WLAN password, default ICAROS_M5_WIFI_PASSWORD from .env.');
	console.log('  --device-id <id>      Controller id, default icaros-station-a-m5.');
	console.log('  --timeout-ms <ms>     Pairing poll timeout.');
	console.log('  --skip-lan            Only check --host-origin for the health command.');
	console.log('  --lan-origin <url>    Explicit LAN origin for the health command.');
	console.log('  --strict-tls          Do not disable TLS verification for local mkcert checks.');
	console.log('  --show-sensitive      Print configured SSID for local debugging.');
}

function parseOptions(args: readonly string[]): ReadonlyMap<string, string | true> {
	const options = new Map<string, string | true>();
	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (!arg.startsWith('--')) {
			continue;
		}

		const keyValue = arg.slice(2);
		const equalsIndex = keyValue.indexOf('=');
		if (equalsIndex >= 0) {
			options.set(keyValue.slice(0, equalsIndex), keyValue.slice(equalsIndex + 1));
			continue;
		}

		const next = args[index + 1];
		if (next !== undefined && !next.startsWith('--')) {
			options.set(keyValue, next);
			index += 1;
			continue;
		}

		options.set(keyValue, true);
	}

	return options;
}

function readOption(options: ReadonlyMap<string, string | true>, key: string): string | null {
	const value = options.get(key);
	return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readInteger(value: string | null, fallback: number): number {
	if (value === null) {
		return fallback;
	}

	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readUrlOption(options: ReadonlyMap<string, string | true>, key: string): URL | null {
	const value = readOption(options, key);
	if (value === null) {
		return null;
	}

	return new URL(value);
}

function printEnvironment(config: CliConfig): void {
	console.log(`hostOrigin=${config.hostOrigin.origin}`);
	console.log(`ssid=${formatSsid(config)}`);
	console.log(`password=${config.password === null ? '<missing>' : '<redacted>'}`);
	console.log(`deviceId=${config.deviceId}`);
	console.log(`pairingApi=${new URL(PAIRING_API_PATH, config.hostOrigin).toString()}`);
	console.log(`insecureTls=${config.insecureTls}`);
}

function formatSsid(config: CliConfig): string {
	if (config.ssid === null) {
		return '<missing>';
	}

	if (!config.showSensitive) {
		return '<redacted>';
	}

	return config.ssid;
}

async function printPairingUrl(config: CliConfig): Promise<void> {
	const status = await readPairingStatus(config);
	console.log(status.connection.pairedDeviceUrl);
}

async function setPairingDebug(config: CliConfig, enabled: boolean): Promise<void> {
	await postPairingCommand(config, { action: 'setDebug', enabled });
}

async function runPairing(config: CliConfig): Promise<void> {
	if (config.ssid === null || config.password === null) {
		throw new Error(
			'Missing WLAN credentials. Set ICAROS_M5_WIFI_SSID and ICAROS_M5_WIFI_PASSWORD.'
		);
	}

	await setPairingDebug(config, true);
	await postPairingCommand(config, {
		action: 'connectUsb',
		input: {
			ssid: config.ssid,
			password: config.password,
			deviceId: config.deviceId,
			staticIp: config.staticIp,
			gateway: config.gateway,
			subnet: config.subnet,
			dns: config.dns
		}
	});

	console.log('pairing=started');
	await pollPairing(config);
}

async function runProbe(config: CliConfig): Promise<void> {
	await setPairingDebug(config, true);
	await postPairingCommand(config, { action: 'probeUsb' });
	console.log('probe=started');
	await pollPairing(config, false);
}

async function runFlash(config: CliConfig): Promise<void> {
	await setPairingDebug(config, true);
	await postPairingCommand(config, { action: 'flashFirmware' });
	console.log('flash=started');
	await pollPairing(config, false);
}

async function postPairingCommand(config: CliConfig, command: unknown): Promise<void> {
	const response = await fetch(new URL(PAIRING_API_PATH, config.hostOrigin), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Origin: config.hostOrigin.origin
		},
		body: JSON.stringify(command)
	});

	if (!response.ok) {
		throw new Error(`M5 pairing command failed with ${response.status}: ${await response.text()}`);
	}
}

async function pollPairing(config: CliConfig, waitForReady: boolean = true): Promise<void> {
	const startedAt = Date.now();
	let lastLine = '';

	while (Date.now() - startedAt < config.timeoutMs) {
		const status = (await readPairingStatus(config)).usbSetup;

		const line = formatStatus(status);
		if (line !== lastLine) {
			console.log(line);
			lastLine = line;
		}

		if (status.state === 'ready' || (!waitForReady && !isPairingBusyState(status.state))) {
			return;
		}

		if (status.state === 'failed') {
			throw new Error(status.error ?? 'Pairing failed.');
		}

		await sleep(config.pollIntervalMs);
	}

	throw new Error(`Timed out after ${config.timeoutMs}ms waiting for pairing result.`);
}

function isPairingBusyState(state: UsbSetupSnapshot['state']): boolean {
	return (
		state === 'usb_connected' ||
		state === 'usb_probe' ||
		state === 'firmware_check' ||
		state === 'firmware_update' ||
		state === 'configure' ||
		state === 'usb_test' ||
		state === 'wlan_test'
	);
}

async function readPairingStatus(config: CliConfig): Promise<M5PairingStatusView> {
	const response = await fetch(new URL(PAIRING_API_PATH, config.hostOrigin));
	if (!response.ok) {
		throw new Error(`Could not read M5 pairing status: ${response.status}`);
	}

	const parsed: unknown = await response.json();
	if (!isPairingStatusView(parsed)) {
		throw new Error('Host returned invalid M5 pairing status JSON.');
	}

	return parsed;
}

function isPairingStatusView(value: unknown): value is M5PairingStatusView {
	return (
		typeof value === 'object' &&
		value !== null &&
		!Array.isArray(value) &&
		'connection' in value &&
		'usbSetup' in value
	);
}

function printSnapshot(view: M5PairingStatusView): void {
	const status = view.usbSetup;
	console.log(`pairedDeviceUrl=${view.connection.pairedDeviceUrl}`);
	console.log(formatStatus(status));
	console.log(`serverUrl=${status.serverUrl ?? '<none>'}`);
	console.log(`lastFrameAt=${status.lastFrameAt ?? '<none>'}`);
	console.log(`controllerIssue=${status.controllerIssue ?? '<none>'}`);
	console.log(`usbConnected=${status.usbConnected}`);
	console.log(`usbPort=${status.usbPort ?? '<none>'}`);
	console.log(`requiredFirmware=${status.requiredFirmwareVersion}`);
	console.log(`canFlashFirmware=${status.canFlashFirmware}`);
	console.log(`canConfigure=${status.canConfigure}`);
	console.log(`nextAction=${readNextAction(status)}`);
	console.log(`debugLines=${status.debugLines.length}`);
	for (const line of status.debugLines.slice(-8)) {
		console.log(formatDebugLine(line));
	}
}

function printChecklist(status: UsbSetupSnapshot): void {
	for (const item of readChecklistItems(status)) {
		console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.key}: ${item.detail}`);
	}
	console.log(`nextAction=${readNextAction(status)}`);
}

function readChecklistItems(
	status: UsbSetupSnapshot
): readonly Readonly<{ key: string; ok: boolean; detail: string }>[] {
	return [
		{
			key: 'usb',
			ok: status.usbConnected,
			detail: status.usbPort ?? 'USB controller has not been detected'
		},
		{
			key: 'firmware',
			ok: status.firmwareStatus === 'current',
			detail: `${status.currentFirmwareVersion ?? '<none>'} / required ${status.requiredFirmwareVersion}`
		},
		{
			key: 'flash',
			ok: status.flashState === 'succeeded' || status.firmwareStatus === 'current',
			detail: status.canFlashFirmware
				? `flashState=${status.flashState}`
				: 'disabled by ICAROS_ALLOW_M5_FIRMWARE_UPDATE'
		},
		{
			key: 'configure',
			ok: status.canConfigure && status.usbOk && status.serverUrl !== null,
			detail: status.canConfigure
				? 'setup is allowed'
				: 'setup is blocked until firmware is current'
		},
		{
			key: 'wlan',
			ok: status.wlanOk,
			detail:
				status.controllerIssue ??
				(status.lastFrameAt === null
					? 'no paired WLAN/WebSocket frame received'
					: `lastFrameAt=${status.lastFrameAt}`)
		}
	];
}

function readNextAction(status: UsbSetupSnapshot): string {
	if (isPairingBusyState(status.state)) {
		return 'wait-or-abort';
	}

	if (status.state === 'ready' && status.wlanOk && status.firmwareStatus === 'current') {
		return 'ready';
	}

	if (!status.usbConnected) {
		return 'probe';
	}

	if (status.firmwareStatus !== 'current') {
		return status.canFlashFirmware ? 'flash' : 'enable-flash-policy';
	}

	if (!status.usbOk || status.serverUrl === null) {
		return 'pair';
	}

	if (!status.wlanOk) {
		return 'wait-for-wlan-or-debug';
	}

	return 'ready';
}

function formatStatus(status: UsbSetupSnapshot): string {
	return [
		`state=${status.state}`,
		`step=${status.step}`,
		`progress=${status.progress}`,
		`usbConnected=${status.usbConnected}`,
		`usbPort=${status.usbPort ?? '<none>'}`,
		`usbOk=${status.usbOk}`,
		`wlanOk=${status.wlanOk}`,
		`firmware=${status.currentFirmwareVersion ?? '<none>'}`,
		`requiredFirmware=${status.requiredFirmwareVersion}`,
		`firmwareStatus=${status.firmwareStatus}`,
		`flash=${status.flashState}`,
		`canFlash=${status.canFlashFirmware}`,
		`canConfigure=${status.canConfigure}`,
		`controllerIssue=${status.controllerIssue ?? '<none>'}`,
		`nextAction=${readNextAction(status)}`,
		`error=${status.error ?? '<none>'}`
	].join(' ');
}

function formatDebugLine(line: PairingDebugLine): string {
	return `${new Date(line.timestamp).toISOString()} ${line.source}: ${line.message}`;
}

function formatCliError(error: unknown): string {
	if (error instanceof Error) {
		return `ERROR ${error.message}`;
	}

	return `ERROR ${String(error)}`;
}

async function runProtocolChecks(config: CliConfig): Promise<void> {
	const runtimeUrl = toWebSocketUrl(config.hostOrigin, '/ws/runtime');
	const redactedDeviceUrl = (await readPairingStatus(config)).connection.pairedDeviceUrl;
	const deviceUrl = unredactPairingUrl(redactedDeviceUrl);
	const checks: ProtocolCheck[] = [{ label: 'runtime', url: runtimeUrl, expect: 'open' }];
	checks.push({
		label: 'device-missing-token',
		url: toDeviceUrlWithoutToken(redactedDeviceUrl),
		expect: 'reject'
	});
	checks.push({
		label: 'device-wrong-token',
		url: toDeviceUrlWithToken(redactedDeviceUrl, 'wrong-token-for-handshake-probe'),
		expect: 'reject'
	});

	if (deviceUrl === null) {
		console.log(
			'SKIP device: ICAROS_DEVICE_PAIRING_TOKEN is required for /ws/device handshake checks.'
		);
	}

	if (deviceUrl !== null) {
		checks.push({ label: 'device', url: deviceUrl, expect: 'open' });
		checks.push({
			label: 'device-arduino-protocol',
			url: deviceUrl,
			expect: 'open',
			protocols: ['arduino']
		});
	}

	for (const check of checks) {
		const result = await openWebSocket(check.url, config.insecureTls, check.protocols);
		const ok =
			check.expect === 'open'
				? result === 'open'
				: result.startsWith('unexpected-response 401') || result.startsWith('error');
		console.log(
			`${ok ? 'PASS' : 'FAIL'} ${check.label}: ${redactPairingToken(check.url)} -> ${result}`
		);
		if (!ok) {
			process.exitCode = 1;
		}
	}
}

function toDeviceUrlWithoutToken(redactedUrl: string): string {
	const url = new URL(redactedUrl);
	url.searchParams.delete('pairing');
	return url.toString();
}

function toDeviceUrlWithToken(redactedUrl: string, token: string): string {
	const url = new URL(redactedUrl);
	url.searchParams.set('pairing', token);
	return url.toString();
}

function unredactPairingUrl(redactedUrl: string): string | null {
	const token = process.env.ICAROS_DEVICE_PAIRING_TOKEN?.trim();
	if (token === undefined || token === '') {
		return null;
	}

	const url = new URL(redactedUrl);
	url.searchParams.set('pairing', token);
	return url.toString();
}

async function runHealthCheck(config: CliConfig): Promise<void> {
	const localUrl = new URL('/health', config.hostOrigin);
	await printHealthResult('configured', localUrl);

	if (config.skipLan) {
		return;
	}

	const lanOrigin =
		config.lanOrigin ?? new URL(resolveConnectionInfo(config.hostOrigin).httpOrigin);
	const lanUrl = new URL('/health', lanOrigin);
	if (lanUrl.origin !== localUrl.origin) {
		await printHealthResult('lan', lanUrl);
	}
}

async function printHealthResult(label: string, url: URL): Promise<void> {
	try {
		const response = await fetch(url);
		console.log(
			`${response.ok ? 'PASS' : 'FAIL'} ${label}: ${url.toString()} -> ${response.status}`
		);
		if (!response.ok) {
			process.exitCode = 1;
		}
	} catch (error) {
		console.log(`FAIL ${label}: ${url.toString()} -> ${formatError(error)}`);
		process.exitCode = 1;
	}
}

async function runLanDiagnostics(config: CliConfig): Promise<void> {
	const status = await readPairingStatus(config);
	const deviceUrl = new URL(status.connection.pairedDeviceUrl);
	const hostHealthUrl = new URL('/health', config.hostOrigin);
	const devicePort = deviceUrl.port === '' ? '80' : deviceUrl.port;
	const hostPort =
		config.hostOrigin.port === ''
			? defaultPortForProtocol(config.hostOrigin)
			: config.hostOrigin.port;

	console.log(`hostOrigin=${config.hostOrigin.origin}`);
	console.log(`pairedDeviceUrl=${status.connection.pairedDeviceUrl}`);
	console.log(`hostHealth=${await fetchStatus(hostHealthUrl)}`);
	console.log(`hostPortListening=${await isTcpPortListening(hostPort)}`);
	console.log(`devicePortListening=${await isTcpPortListening(devicePort)}`);
	printLocalIpv4Interfaces();
	await printWifiAssociation(config);
	await printArpNeighbors(deviceUrl.hostname);
}

function defaultPortForProtocol(url: URL): string {
	if (url.protocol === 'https:') {
		return '443';
	}

	return '80';
}

async function fetchStatus(url: URL): Promise<string> {
	try {
		const response = await fetch(url);
		return `${response.ok ? 'PASS' : 'FAIL'} ${response.status}`;
	} catch (error) {
		return `FAIL ${formatError(error)}`;
	}
}

async function isTcpPortListening(port: string): Promise<string> {
	if (port === '') {
		return 'unknown';
	}

	const result = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN']);
	if (!result.ok || result.stdout.trim() === '') {
		return 'no';
	}

	return 'yes';
}

function printLocalIpv4Interfaces(): void {
	const rows: string[] = [];
	for (const [name, entries] of Object.entries(networkInterfaces())) {
		for (const entry of entries ?? []) {
			if (entry.family === 'IPv4' && !entry.internal) {
				rows.push(`${name}:${entry.address}`);
			}
		}
	}

	console.log(`localIpv4=${rows.length === 0 ? '<none>' : rows.join(',')}`);
}

async function printWifiAssociation(config: CliConfig): Promise<void> {
	if (process.platform !== 'darwin') {
		console.log('wifiAssociation=unsupported-platform');
		return;
	}

	const result = await runCommand('networksetup', ['-getairportnetwork', 'en0']);
	if (!result.ok) {
		console.log('wifiAssociation=unknown');
		return;
	}

	const text = result.stdout.trim();
	if (text.includes('not associated')) {
		console.log('wifiAssociation=not-associated');
		return;
	}

	const ssid = text.replace(/^Current Wi-Fi Network:\s*/, '').trim();
	console.log(`wifiAssociation=${config.showSensitive ? ssid : '<associated>'}`);
}

async function printArpNeighbors(hostname: string): Promise<void> {
	const prefix = ipv4Prefix(hostname);
	if (prefix === null) {
		console.log('arpNeighbors=unsupported-host');
		return;
	}

	const result = await runCommand('arp', ['-a']);
	if (!result.ok) {
		console.log('arpNeighbors=unknown');
		return;
	}

	const neighbors = result.stdout
		.split(/\r?\n/)
		.map((line) => line.match(/\((\d+\.\d+\.\d+\.\d+)\)/)?.[1])
		.filter((ip): ip is string => ip?.startsWith(prefix) ?? false);

	console.log(`arpNeighbors=${neighbors.length}`);
	console.log(`arpNeighborIps=${neighbors.slice(0, 24).join(',') || '<none>'}`);
}

function ipv4Prefix(hostname: string): string | null {
	const match = hostname.match(/^(\d+\.\d+\.\d+)\.\d+$/);
	if (match === null) {
		return null;
	}

	return `${match[1]}.`;
}

async function runCommand(
	command: string,
	args: readonly string[]
): Promise<Readonly<{ ok: boolean; stdout: string; stderr: string }>> {
	try {
		const result = await execFileAsync(command, [...args], { timeout: 5_000 });
		return { ok: true, stdout: result.stdout, stderr: result.stderr };
	} catch (error) {
		if (isCommandError(error)) {
			return { ok: false, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
		}

		return { ok: false, stdout: '', stderr: formatError(error) };
	}
}

function isCommandError(error: unknown): error is Error & { stdout?: string; stderr?: string } {
	return error instanceof Error;
}

function toWebSocketUrl(origin: URL, path: string): string {
	const url = new URL(path, origin);
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
	return url.toString();
}

function redactPairingToken(input: string): string {
	try {
		const url = new URL(input);
		if (url.searchParams.has('pairing')) {
			url.searchParams.set('pairing', 'redacted');
		}
		return url.toString();
	} catch {
		return input.replace(/([?&]pairing=)[^&\s]+/g, '$1redacted');
	}
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function openWebSocket(
	url: string,
	insecureTls: boolean,
	protocols: readonly string[] = []
): Promise<string> {
	return new Promise((resolveResult) => {
		const socket = new WebSocket(url, protocols, {
			handshakeTimeout: 2_500,
			rejectUnauthorized: !insecureTls
		});
		const timeout = setTimeout(() => finish('timeout'), 3_000);

		const finish = (result: string): void => {
			clearTimeout(timeout);
			socket.close();
			resolveResult(result);
		};

		socket.on('open', () => finish('open'));
		socket.on('unexpected-response', (_request, response) =>
			finish(`unexpected-response ${response.statusCode}`)
		);
		socket.on('error', (error) => finish(`error ${error.message}`));
	});
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
