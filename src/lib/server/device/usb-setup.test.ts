/**
 * Purpose: regression tests for the M5 USB setup firmware workflow.
 * They verify process arguments and UI/source gates without touching hardware.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnCall = Readonly<{
	command: string;
	args: readonly string[];
	options: unknown;
}>;

const childProcessMock = vi.hoisted(() => {
	type LocalListener = (...args: readonly unknown[]) => void;

	class FakeStream {
		setEncoding = vi.fn();
		on = vi.fn((_event: string, _listener: LocalListener) => this);
	}

	class FakeChildProcess {
		stdout = new FakeStream();
		stderr = new FakeStream();
		stdin = { end: vi.fn() };
		killed = false;

		on = vi.fn((_event: string, _listener: LocalListener) => this);
		once = vi.fn((_event: string, _listener: LocalListener) => this);
		kill = vi.fn(() => {
			this.killed = true;
			return true;
		});
	}

	const calls: SpawnCall[] = [];
	const processes: FakeChildProcess[] = [];
	const spawn = vi.fn((command: string, args: readonly string[], options: unknown) => {
		const process = new FakeChildProcess();
		calls.push({ command, args: [...args], options });
		processes.push(process);
		return process;
	});

	return { calls, processes, spawn };
});

const storageMock = vi.hoisted(() => ({
	hashDevicePairingToken: vi.fn(() => 'pairing-token-hash'),
	readSavedControllerConfig: vi.fn(() => null),
	writeControllerConfig: vi.fn(),
	writeDebugSnapshot: vi.fn()
}));

vi.mock('node:child_process', () => ({ spawn: childProcessMock.spawn }));
vi.mock('./usb-setup-storage', () => storageMock);

const REQUIRED_FIRMWARE_VERSION = '0.2.2-icaros-ws-reconnect';
const RUNTIME_KEY = Symbol.for('icaros.host.usbSetupRuntime');
const SOURCE_EXTENSIONS = new Set(['.md', '.py', '.svelte', '.ts']);

describe('M5 USB firmware setup workflow', () => {
	beforeEach(() => {
		vi.resetModules();
		childProcessMock.calls.length = 0;
		childProcessMock.processes.length = 0;
		childProcessMock.spawn.mockClear();
		storageMock.hashDevicePairingToken.mockClear();
		storageMock.readSavedControllerConfig.mockClear();
		storageMock.writeControllerConfig.mockClear();
		storageMock.writeDebugSnapshot.mockClear();
		delete process.env[firmwarePolicyEnvName()];
		delete (globalThis as typeof globalThis & Record<symbol, unknown>)[RUNTIME_KEY];
	});

	it('starts firmware flash without env policy and without policy flags', async () => {
		const { startFirmwareFlash } = await import('./usb-setup');

		startFirmwareFlash();

		expect(childProcessMock.calls).toHaveLength(1);
		expect(childProcessMock.calls[0]?.command).toBe('python3');
		expect(childProcessMock.calls[0]?.args).toContain('--mode');
		expect(childProcessMock.calls[0]?.args).toContain('flash');
		expect(childProcessMock.calls[0]?.args).not.toContain(firmwarePolicyFlag('allow'));
		expect(childProcessMock.calls[0]?.args).not.toContain(firmwarePolicyFlag('skip'));
	});

	it('uses config stdin for configure mode', async () => {
		const { recordPairedDeviceFrame, startUsbSetup } = await import('./usb-setup');

		recordPairedDeviceFrame({ firmwareVersion: REQUIRED_FIRMWARE_VERSION });
		startUsbSetup('ws://127.0.0.1:5184/ws/device?pairing=test', {
			ssid: 'XRHUB',
			password: 'secret',
			deviceId: 'icaros-station-a-m5',
			staticIp: null,
			gateway: null,
			subnet: null,
			dns: null
		});

		expect(childProcessMock.calls[0]?.args).toContain('configure');
		expect(childProcessMock.calls[0]?.args).toContain('--config-stdin');
		expect(childProcessMock.processes[0]?.stdin.end).toHaveBeenCalledOnce();
	});

	it('keeps busy firmware flash from starting a second workflow', async () => {
		const { startFirmwareFlash, startUsbProbe } = await import('./usb-setup');

		startFirmwareFlash();
		startUsbProbe();

		expect(childProcessMock.calls).toHaveLength(1);
		expect(childProcessMock.calls[0]?.args).toContain('flash');
	});

	it('keeps busy probe from starting setup or flash', async () => {
		const { startFirmwareFlash, startUsbProbe, startUsbSetup } = await import('./usb-setup');

		startUsbProbe();
		startUsbSetup('ws://127.0.0.1:5184/ws/device?pairing=test', {
			ssid: 'XRHUB',
			password: 'secret',
			deviceId: 'icaros-station-a-m5',
			staticIp: null,
			gateway: null,
			subnet: null,
			dns: null
		});
		startFirmwareFlash();

		expect(childProcessMock.calls).toHaveLength(1);
		expect(childProcessMock.calls[0]?.args).toContain('probe');
	});

	it('dispatches flashFirmware without requiring an env flag', async () => {
		const { runM5PairingCommand } = await import('./pairing-service');

		const result = runM5PairingCommand(new URL('https://localhost:5183'), {
			action: 'flashFirmware'
		});

		expect(result.ok).toBe(true);
		expect(childProcessMock.calls).toHaveLength(1);
		expect(childProcessMock.calls[0]?.args).toContain('flash');
	});
});

describe('firmware setup source gates', () => {
	it('does not keep firmware update behind USB or policy flags', () => {
		const workflowActions = readProjectFile(
			'src/routes/_console/components/controller-workflow-actions.svelte'
		);
		const usbScript = readProjectFile('scripts/connect-m5-usb.py');
		const sourceText = readProductionSourceText();

		expect(workflowActions).not.toContain('!state.usbSetup.usbConnected');
		expect(usbScript).not.toContain(firmwarePolicyFlag('allow'));
		expect(usbScript).not.toContain(firmwarePolicyFlag('skip'));
		expect(sourceText).not.toContain(firmwarePolicyEnvName());
		expect(sourceText).not.toContain(['can', 'Flash', 'Firmware'].join(''));
	});
});

function readProjectFile(path: string): string {
	return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function readProductionSourceText(): string {
	return ['src', 'scripts', 'docs'].flatMap(readProductionFiles).map(readProjectFile).join('\n');
}

function readProductionFiles(path: string): string[] {
	const absolutePath = resolve(process.cwd(), path);
	if (!existsSync(absolutePath)) {
		return [];
	}

	const stats = statSync(absolutePath);
	if (!stats.isDirectory()) {
		return isProductionSourceFile(path) ? [path] : [];
	}

	return readdirSync(absolutePath).flatMap((name) => readProductionFiles(join(path, name)));
}

function isProductionSourceFile(path: string): boolean {
	return SOURCE_EXTENSIONS.has(extname(path)) && !path.endsWith('.test.ts');
}

function firmwarePolicyEnvName(): string {
	return ['ICAROS_ALLOW', 'M5_FIRMWARE_UPDATE'].join('_');
}

function firmwarePolicyFlag(mode: 'allow' | 'skip'): string {
	return [`--${mode}`, 'firmware', 'update'].join('-');
}
