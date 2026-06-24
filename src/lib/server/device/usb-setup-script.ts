/**
 * Purpose: small adapter around the local Python USB setup script.
 * It builds process arguments and wires stdout/stderr callbacks; workflow
 * state transitions remain in usb-setup.ts.
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';

const USB_SETUP_SCRIPT = resolve(process.cwd(), 'scripts/connect-m5-usb.py');

type UsbScriptMode = 'configure' | 'probe' | 'flash';
type UsbScriptStdio = 'pipe' | 'ignore';

export function startUsbScript(
	mode: UsbScriptMode,
	stdin: UsbScriptStdio,
	onStdout: (chunk: string) => void,
	onStderr: (chunk: string) => void
): ChildProcess {
	const child = spawn('python3', buildScriptArgs(mode), {
		cwd: process.cwd(),
		stdio: [stdin, 'pipe', 'pipe']
	});
	child.stdout?.setEncoding('utf8');
	child.stderr?.setEncoding('utf8');
	child.stdout?.on('data', onStdout);
	child.stderr?.on('data', onStderr);
	return child;
}

function buildScriptArgs(mode: UsbScriptMode): string[] {
	const baseArgs = [USB_SETUP_SCRIPT, '--mode', mode];
	const rebootArgs =
		process.env.ICAROS_M5_REBOOT_AFTER_CONFIGURE === 'false' ? [] : ['--reboot-after-configure'];

	if (mode === 'configure') {
		return [...baseArgs, '--config-stdin', ...rebootArgs];
	}

	return [...baseArgs, ...rebootArgs];
}
