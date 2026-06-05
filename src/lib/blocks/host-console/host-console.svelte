<!--
	Purpose: composed Icaros Host operator console. It keeps route files focused
	on data loading while this block owns page-specific presentation and actions.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		Activity,
		ChevronDown,
		CircleStop,
		ExternalLink,
		Gauge,
		Glasses,
		Play,
		PlugZap,
		RadioTower,
		Router,
		Terminal
	} from '@lucide/svelte';

	import {
		Button,
		Collapsible,
		Kbd,
		StatusDot,
		Switch
	} from '$lib/components';
	import type { ControlOrientation } from '$lib/protocol';
	import {
		createRuntimeDebugFrame,
		formatAge,
		formatSignedUnit,
		parseRuntimeDebugMessage,
		toQualityPercent,
		toUnitPercent,
		type RuntimeDebugFrame,
		type RuntimeDebugStatus
	} from './runtime-debug';
	import type { HostConsoleProps } from './types';

	const DEBUG_FRAME_LIMIT = 12;
	const DEBUG_CLIENT_ID = 'host-console-debug';

	let { connection, station, usbSetup }: HostConsoleProps = $props();

	let networkOpen = $state(true);
	let selectedExperienceId = $state('');
	let usbSsid = $state('');
	let usbPassword = $state('');
	let usbDeviceId = $state('icaros-station-a-m5');
	let usbStaticIp = $state('');
	let usbGateway = $state('');
	let usbSubnet = $state('');
	let usbDns = $state('');
	let usbNow = $state(Date.now());
	let debugStatus = $state<RuntimeDebugStatus>('disconnected');
	let debugSocketOpen = $state(false);
	let debugNow = $state(Date.now());
	let debugLastMessageAt = $state<number | null>(null);
	let debugFrameCount = $state(0);
	let debugStationActiveExperienceId = $state<string | null | undefined>(undefined);
	let debugLastControl = $state<ControlOrientation | null>(null);
	let debugFrames = $state<RuntimeDebugFrame[]>([]);
	let debugSocket: WebSocket | null = null;

	const activeExperienceId = $derived(station.activeExperienceId);
	const consoleUrl = $derived(`${connection.httpOrigin}/`);
	const questLaunchUrl = $derived(connection.questLaunchUrl);
	const experienceTargetUrl = $derived(connection.experienceTargetUrl);
	const m5SocketUrl = $derived(connection.pairedDeviceUrl);
	const runtimeSocketUrl = $derived(`${connection.wsOrigin}/ws/runtime`);
	const debugTargetExperienceId = $derived(
		debugStationActiveExperienceId === undefined
			? activeExperienceId
			: debugStationActiveExperienceId
	);
	const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
	const debugLastMessageAge = $derived(
		debugLastMessageAt === null ? 'never' : formatAge(debugNow - debugLastMessageAt)
	);
	const debugPitchPercent = $derived(toUnitPercent(debugLastControl?.pitch ?? 0));
	const debugRollPercent = $derived(toUnitPercent(debugLastControl?.roll ?? 0));
	const debugQualityPercent = $derived(toQualityPercent(debugLastControl?.quality ?? 0));
	const usbSetupTone = $derived(readUsbSetupTone(usbSetup.state));
	const usbSetupDuration = $derived(formatUsbSetupDuration(usbSetup.startedAt, usbSetup.finishedAt, usbNow));
	const usbSetupBusy = $derived(isUsbSetupBusy(usbSetup.state));
	const usbLastFrameAge = $derived(
		usbSetup.lastFrameAt === null ? 'never' : formatAge(usbNow - usbSetup.lastFrameAt)
	);

	$effect(() => {
		if (selectedExperienceId === '' && activeExperienceId !== null) {
			selectedExperienceId = activeExperienceId;
		}
	});

	onMount(() => {
		debugSocket = new WebSocket(runtimeSocketUrl);
		const clock = window.setInterval(() => {
			debugNow = Date.now();
			usbNow = Date.now();
		}, 250);

		debugStatus = 'connecting';

		debugSocket.onopen = () => {
			debugStatus = 'connected';
			debugSocketOpen = true;
			if (debugSocket !== null) {
				registerDebugTap(debugSocket);
			}
		};

		debugSocket.onmessage = (event: MessageEvent) => {
			readDebugMessage(String(event.data));
		};

		debugSocket.onerror = () => {
			debugStatus = 'error';
		};

		debugSocket.onclose = () => {
			debugSocketOpen = false;
			debugStatus = 'disconnected';
		};

		return () => {
			window.clearInterval(clock);
			debugSocketOpen = false;
			debugSocket?.close();
			debugSocket = null;
		};
	});

	$effect(() => {
		if (!isUsbSetupBusy(usbSetup.state)) {
			return;
		}

		const refresh = window.setInterval(() => {
			void invalidateAll();
		}, 1_000);

		return () => window.clearInterval(refresh);
	});

	$effect(() => {
		if (!debugSocketOpen) {
			return;
		}

		const activeId = debugTargetExperienceId;
		const socket = debugSocket;

		if (socket !== null) {
			registerDebugTap(socket, activeId);
		}
	});

	function readDebugMessage(data: string): void {
		const message = parseRuntimeDebugMessage(data);

		if (message === null) {
			return;
		}

		const receivedAt = Date.now();
		debugLastMessageAt = receivedAt;

		if (message.type === 'station.state') {
			debugStationActiveExperienceId = message.payload.activeExperienceId;
			return;
		}

		debugLastControl = message.payload;
		debugFrameCount += 1;
		debugFrames = [
			createRuntimeDebugFrame(debugFrameCount, message.payload, receivedAt),
			...debugFrames
		].slice(0, DEBUG_FRAME_LIMIT);
	}

	function registerDebugTap(
		socket: WebSocket,
		experienceId: string | null = debugTargetExperienceId
	): void {
		if (socket.readyState !== WebSocket.OPEN) {
			return;
		}

		socket.send(
			JSON.stringify({
				type: 'client.register',
				payload:
					experienceId === null
						? { role: 'operator', id: DEBUG_CLIENT_ID }
						: {
								role: 'experience',
								id: DEBUG_CLIENT_ID,
								experienceId
							}
			})
		);
	}

	function readDebugStatusTone(
		status: RuntimeDebugStatus
	): 'default' | 'success' | 'warning' | 'danger' {
		if (status === 'connected') {
			return 'success';
		}

		if (status === 'connecting') {
			return 'warning';
		}

		if (status === 'error') {
			return 'danger';
		}

		return 'default';
	}

	function readUsbSetupTone(
		state: typeof usbSetup.state
	): 'default' | 'success' | 'warning' | 'danger' {
		if (state === 'ready') {
			return 'success';
		}

		if (isUsbSetupBusy(state)) {
			return 'warning';
		}

		if (state === 'failed') {
			return 'danger';
		}

		return 'default';
	}

	function formatUsbSetupDuration(
		startedAt: number | null,
		finishedAt: number | null,
		now: number
	): string {
		if (startedAt === null) {
			return 'not run';
		}

		return formatAge((finishedAt ?? now) - startedAt);
	}

	function isUsbSetupBusy(state: typeof usbSetup.state): boolean {
		return (
			state === 'usb_connected' ||
			state === 'firmware_check' ||
			state === 'firmware_update' ||
			state === 'configure' ||
			state === 'usb_test' ||
			state === 'wlan_test'
		);
	}
</script>

<main class="host-console">
	<header class="host-console__header">
		<div class="host-console__title-block">
			<p class="host-console__kicker">station-a // local host console</p>
			<h1 class="host-console__title">
				<Terminal size={24} aria-hidden="true" />
				Icaros Host
			</h1>
		</div>
	</header>

	<section class="host-console__grid" aria-label="Station overview">
		<article class="host-console__panel host-console__panel--primary">
			<div class="host-console__panel-head">
				<span class="host-console__label">active experience</span>
				<StatusDot
					tone={activeExperienceId === null ? 'default' : 'success'}
					label={activeExperienceId === null ? 'No active experience' : 'Experience active'}
				/>
			</div>
			<strong class="host-console__readout">{activeExperienceId ?? 'none'}</strong>
			<p class="host-console__copy">
				Nur diese Experience erhält normalisierte M5-Steuerdaten über den Runtime-Socket.
			</p>
		</article>

		<article class="host-console__panel host-console__panel--network">
			<Collapsible.Root bind:open={networkOpen}>
				<Collapsible.Trigger>
					<span class="host-console__label">Verbindungsadressen</span>
					<ChevronDown size={16} aria-hidden="true" />
				</Collapsible.Trigger>
				<Collapsible.Content>
					<ul class="host-console__mini-list">
						<li>
							<span class="host-console__endpoint-icon">
								<Glasses size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{questLaunchUrl}</Kbd>
								<span>Quest / Brille öffnet die aktive Experience</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<Terminal size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{consoleUrl}</Kbd>
								<span>Operator-Konsole</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<RadioTower size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{m5SocketUrl}</Kbd>
								<span>M5 Controller sendet Rohdaten</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<Router size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{runtimeSocketUrl}</Kbd>
								<span>Experience verbindet sich und registriert ihre ID</span>
							</div>
						</li>
					</ul>
					<p class="host-console__copy">
						Diese Adressen auf Geräten im selben LAN verwenden.
					</p>
				</Collapsible.Content>
			</Collapsible.Root>
		</article>
	</section>

	<section class="host-console__section" aria-labelledby="experience-title">
		<div class="host-console__section-head">
			<div>
				<p class="host-console__kicker">runtime routing</p>
				<h2 id="experience-title" class="host-console__section-title">Aktive Experience</h2>
			</div>

			<form class="host-console__actions" method="POST" action="?/setActive">
				<input
					class="host-console__input"
					name="experienceId"
					bind:value={selectedExperienceId}
					autocomplete="off"
					inputmode="text"
					pattern="[a-z0-9][-a-z0-9]*"
					placeholder="echo-flight"
					aria-label="Active experience id"
				/>
				<Button type="submit" variant="primary" disabled={selectedExperienceId === ''}>
					<Play size={16} aria-hidden="true" />
					Aktiv setzen
				</Button>
			</form>

			{#if activeExperienceId !== null}
				<form method="POST" action="?/setActive">
					<input type="hidden" name="experienceId" value="" />
					<Button type="submit" variant="ghost">
						<CircleStop size={16} aria-hidden="true" />
						Clear
					</Button>
				</form>
				<Button href={questLaunchUrl} variant="secondary" target="_blank" rel="noreferrer">
					<ExternalLink size={16} aria-hidden="true" />
					Launch
				</Button>
			{/if}
		</div>

		<div class="host-console__routing-copy">
			<p class="host-console__copy">
				<Kbd>{questLaunchUrl}</Kbd>
				leitet zur laufenden Client-Seite
				<Kbd>{experienceTargetUrl ?? 'pending active experience'}</Kbd>
				weiter.
			</p>
			<p class="host-console__copy">
				Der aktive Client verbindet sich mit <Kbd>{runtimeSocketUrl}</Kbd> und erhält
				<code>control.orientation</code>.
			</p>
		</div>
	</section>

	<section class="host-console__section" aria-labelledby="usb-title">
		<div class="host-console__section-head">
			<div>
				<p class="host-console__kicker">m5 usb setup</p>
				<h2 id="usb-title" class="host-console__section-title">
					<PlugZap size={18} aria-hidden="true" />
					Controller einrichten
				</h2>
			</div>
			<div class="host-console__debug-status">
				<StatusDot tone={usbSetupTone} label={`USB setup ${usbSetup.state}`} />
				<span>{usbSetup.state}</span>
			</div>
			<form method="POST" action="?/setPairingDebug">
				<input type="hidden" name="enabled" value={usbSetup.debugEnabled ? 'false' : 'true'} />
				<div class="host-console__debug-toggle">
					<Switch
						checked={usbSetup.debugEnabled}
						label="Debug"
						description={usbSetup.debugEnabled ? 'Ein' : 'Aus'}
						onclick={(event) => event.currentTarget.closest('form')?.requestSubmit()}
					/>
				</div>
			</form>
		</div>

		<div class="host-console__routing-copy">
			<p class="host-console__copy">
				<Kbd>{usbSetup.serverUrl ?? m5SocketUrl}</Kbd>
				wird als gepaarter Zielpfad vorbereitet. Grün wird erst angezeigt, wenn USB und
				WLAN/WebSocket erfolgreich geprüft sind.
			</p>
			<p class="host-console__copy">
				Laufzeit: {usbSetupDuration}
				{#if usbSetup.exitCode !== null}
					// exit {usbSetup.exitCode}
				{/if}
			</p>
		</div>

		<form class="host-console__pairing-form" method="POST" action="?/connectUsb">
			<div class="host-console__pairing-grid">
				<label>
					<span>SSID</span>
					<input
						class="host-console__input"
						name="ssid"
						bind:value={usbSsid}
						autocomplete="off"
					/>
				</label>
				<label>
					<span>WiFi Passwort</span>
					<input
						class="host-console__input"
						type="password"
						name="password"
						bind:value={usbPassword}
						autocomplete="off"
					/>
				</label>
				<label>
					<span>Device ID</span>
					<input
						class="host-console__input"
						name="deviceId"
						bind:value={usbDeviceId}
						autocomplete="off"
					/>
				</label>
				<label>
					<span>Statische IP</span>
					<input
						class="host-console__input"
						name="staticIp"
						bind:value={usbStaticIp}
						autocomplete="off"
						inputmode="decimal"
						placeholder="optional"
					/>
				</label>
				<label>
					<span>Gateway</span>
					<input
						class="host-console__input"
						name="gateway"
						bind:value={usbGateway}
						autocomplete="off"
						inputmode="decimal"
						placeholder="optional"
					/>
				</label>
				<label>
					<span>Subnetz</span>
					<input
						class="host-console__input"
						name="subnet"
						bind:value={usbSubnet}
						autocomplete="off"
						inputmode="decimal"
						placeholder="255.255.255.0"
					/>
				</label>
				<label>
					<span>DNS</span>
					<input
						class="host-console__input"
						name="dns"
						bind:value={usbDns}
						autocomplete="off"
						inputmode="decimal"
						placeholder="optional"
					/>
				</label>
			</div>

			<div class="host-console__pairing-actions">
				<Button
					type="submit"
					variant="primary"
					disabled={usbSetupBusy || usbSsid.trim() === '' || usbPassword === ''}
				>
					<PlugZap size={16} aria-hidden="true" />
					{usbSetupBusy ? 'Läuft' : 'Pairing einrichten'}
				</Button>
				<p class="host-console__copy">
					WLAN ist Pflicht. USB richtet ein, der Controller muss danach per WebSocket beim
					Server ankommen.
				</p>
			</div>
		</form>

		<div class="host-console__pairing-status" aria-label="M5 pairing status">
			<div class="host-console__progress" aria-label="Pairing progress">
				<span style={`width: ${usbSetup.progress}%`}></span>
			</div>
			<div class="host-console__pairing-grid host-console__pairing-grid--status">
				<div>
					<span>Schritt</span>
					<strong>{usbSetup.step}</strong>
				</div>
				<div>
					<span>Fortschritt</span>
					<strong>{usbSetup.progress}%</strong>
				</div>
				<div>
					<span>Device ID</span>
					<strong>{usbSetup.deviceId ?? usbDeviceId}</strong>
				</div>
				<div>
					<span>Firmware</span>
					<strong>{usbSetup.firmwareVersion ?? 'pending'}</strong>
				</div>
				<div>
					<span>USB</span>
					<strong>{usbSetup.usbOk ? 'ok' : 'pending'}</strong>
				</div>
				<div>
					<span>WLAN/WebSocket</span>
					<strong>{usbSetup.wlanOk ? 'ok' : 'pending'}</strong>
				</div>
				<div>
					<span>Letztes Frame</span>
					<strong>{usbLastFrameAge}</strong>
				</div>
			</div>
			<p class="host-console__copy">{usbSetup.error ?? usbSetup.message}</p>

			{#if usbSetup.debugEnabled}
				<div class="host-console__debug-note">
					<p class="host-console__copy">
						Debug aktiv. Snapshot für LLMs:
						<Kbd>.icaros/debug/m5-pairing-debug.json</Kbd>
					</p>
				</div>
				<div class="host-console__pairing-debug" aria-label="M5 pairing debug lines">
					{#each usbSetup.debugLines as line (line.id)}
						<div class="host-console__pairing-debug-row" data-source={line.source}>
							<span>{new Date(line.timestamp).toLocaleTimeString()}</span>
							<code>{line.source}</code>
							<span>{line.message}</span>
						</div>
					{:else}
						<p class="host-console__copy">Noch keine Debug-Ereignisse.</p>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<section class="host-console__section" aria-labelledby="debug-title">
		<div class="host-console__section-head">
			<div>
				<p class="host-console__kicker">runtime debug</p>
				<h2 id="debug-title" class="host-console__section-title">
					<Activity size={18} aria-hidden="true" />
					Datenstream
				</h2>
			</div>
			<div class="host-console__debug-status">
				<StatusDot tone={debugStatusTone} label={`Runtime debug ${debugStatus}`} />
				<span>{debugStatus}</span>
			</div>
		</div>

		<div class="host-console__debug-grid">
			<article class="host-console__debug-card">
				<span class="host-console__label">last control</span>
				<div class="host-console__debug-readout">
					<strong>{debugLastControl === null ? 'no frame' : formatSignedUnit(debugLastControl.pitch)}</strong>
					<span>pitch</span>
				</div>
				<div class="host-console__meter" aria-label="Pitch">
					<span style={`width: ${debugPitchPercent}%`}></span>
				</div>
			</article>

			<article class="host-console__debug-card">
				<span class="host-console__label">roll</span>
				<div class="host-console__debug-readout">
					<strong>{debugLastControl === null ? 'no frame' : formatSignedUnit(debugLastControl.roll)}</strong>
					<span>roll</span>
				</div>
				<div class="host-console__meter" aria-label="Roll">
					<span style={`width: ${debugRollPercent}%`}></span>
				</div>
			</article>

			<article class="host-console__debug-card">
				<span class="host-console__label">quality</span>
				<div class="host-console__debug-readout">
					<strong>{debugQualityPercent}%</strong>
					<span>{debugLastControl?.safeMode ? 'safe mode' : 'live'}</span>
				</div>
				<div class="host-console__meter host-console__meter--quality" aria-label="Quality">
					<span style={`width: ${debugQualityPercent}%`}></span>
				</div>
			</article>

			<article class="host-console__debug-card">
				<span class="host-console__label">frames</span>
				<div class="host-console__debug-readout">
					<strong>{debugFrameCount}</strong>
					<span>last {debugLastMessageAge}</span>
				</div>
				<p class="host-console__copy">
					<Gauge size={14} aria-hidden="true" />
					{debugTargetExperienceId ?? 'no active experience'}
				</p>
			</article>
		</div>

		<div class="host-console__debug-log" aria-label="Recent control frames">
			{#each debugFrames as frame (frame.id)}
				<div class="host-console__debug-row" data-safe={frame.safeMode}>
					<span>{formatAge(debugNow - frame.receivedAt)}</span>
					<code>pitch {formatSignedUnit(frame.pitch)}</code>
					<code>roll {formatSignedUnit(frame.roll)}</code>
					<span>q {toQualityPercent(frame.quality)}%</span>
					<span>{frame.safeMode ? 'safe' : 'live'}</span>
				</div>
			{:else}
				<p class="host-console__copy">
					Noch keine <code>control.orientation</code>-Frames empfangen.
				</p>
			{/each}
		</div>
	</section>
</main>

<style>
	.host-console {
		--endpoint-icon-size: 1.15rem;

		min-height: 100svh;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		padding: var(--space-4);
		min-width: 0;
	}

	.host-console__header,
	.host-console__grid,
	.host-console__section {
		width: min(var(--content-max-width), 100%);
		margin: 0 auto;
		min-width: 0;
	}

	.host-console__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding-top: var(--space-3);
		min-width: 0;
	}

	.host-console__title-block {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.host-console__kicker,
	.host-console__label {
		margin: 0;
		font-size: var(--font-size-xs);
		font-weight: 800;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--color-accent);
	}

	.host-console__title,
	.host-console__section-title {
		margin: 0;
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		letter-spacing: 0;
		color: var(--color-text-strong);
	}

	.host-console__title {
		font-size: clamp(1.9rem, 8vw, 2.35rem);
		line-height: 1;
	}

	.host-console__section-title {
		font-size: 1rem;
	}

	.host-console__grid {
		display: grid;
		grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1.2fr);
		gap: var(--space-3);
	}

	.host-console__panel,
	.host-console__section {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--color-surface), transparent 4%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
		min-width: 0;
	}

	.host-console__panel {
		display: grid;
		gap: var(--space-3);
		align-content: start;
		min-height: 7rem;
		padding: var(--space-4);
		min-width: 0;
	}

	.host-console__panel--primary {
		border-color: var(--color-accent-muted);
		background:
			linear-gradient(135deg, rgba(114, 230, 164, 0.08), transparent 45%),
			var(--color-surface);
	}

	.host-console__panel--network {
		border-color: color-mix(in srgb, var(--color-info), var(--color-border) 78%);
	}

	.host-console__panel-head,
	.host-console__section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__readout {
		font-size: 1.85rem;
		line-height: 1;
		color: var(--color-text-strong);
		overflow-wrap: anywhere;
	}

	.host-console__copy,
	.host-console__mini-list {
		margin: 0;
		color: var(--color-text-soft);
		font-size: var(--font-size-sm);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.host-console__mini-list {
		padding: 0;
		list-style: none;
	}

	.host-console__mini-list {
		display: grid;
		gap: var(--space-3);
	}

	.host-console__mini-list li {
		display: grid;
		grid-template-columns: var(--endpoint-icon-size) minmax(0, 1fr);
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.host-console__mini-list li > div {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.host-console__mini-list span {
		overflow-wrap: anywhere;
	}

	.host-console__endpoint-icon {
		display: inline-grid;
		place-items: center;
		width: var(--endpoint-icon-size);
		height: var(--endpoint-icon-size);
		align-self: start;
		margin-top: 0.15rem;
		color: color-mix(in srgb, var(--color-info), var(--color-text-soft) 20%);
		line-height: 1;
	}

	.host-console__endpoint-icon :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}

	.host-console__section {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		min-width: 0;
	}

	.host-console__actions {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto;
		gap: 0.5rem;
		min-width: min(28rem, 100%);
	}

	.host-console__routing-copy {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.host-console__pairing-form,
	.host-console__pairing-grid {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__pairing-grid {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.host-console__pairing-grid label {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		color: var(--color-text-soft);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}

	.host-console__pairing-actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__pairing-status {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__debug-note {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.host-console__pairing-debug {
		display: grid;
		gap: 0.4rem;
		min-width: 0;
		max-height: 18rem;
		overflow: auto;
	}

	.host-console__pairing-debug-row {
		display: grid;
		grid-template-columns: 5.5rem 5.5rem minmax(0, 1fr);
		gap: 0.5rem;
		align-items: start;
		min-width: 0;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		color: var(--color-text-soft);
		font-size: var(--font-size-xs);
		background: color-mix(in srgb, var(--color-background), transparent 8%);
	}

	.host-console__pairing-debug-row[data-source='stderr'] {
		border-color: color-mix(in srgb, var(--color-danger), var(--color-border) 70%);
	}

	.host-console__pairing-debug-row code,
	.host-console__pairing-debug-row span {
		overflow-wrap: anywhere;
	}

	.host-console__pairing-grid--status > div {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: color-mix(in srgb, var(--color-background), transparent 12%);
	}

	.host-console__pairing-grid--status span {
		color: var(--color-text-soft);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}

	.host-console__pairing-grid--status strong {
		color: var(--color-text-strong);
		font-size: var(--font-size-sm);
		overflow-wrap: anywhere;
	}

	.host-console__progress {
		height: 0.55rem;
		overflow: hidden;
		border-radius: 999px;
		background: var(--color-background);
		border: 1px solid var(--color-border);
	}

	.host-console__progress span {
		display: block;
		height: 100%;
		background: color-mix(in srgb, var(--color-success), var(--color-info) 35%);
	}

	.host-console__debug-status {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		color: var(--color-text-soft);
		font-size: var(--font-size-sm);
		text-transform: uppercase;
	}

	.host-console__debug-toggle {
		display: inline-flex;
		align-items: center;
		min-height: 2.55rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 0.45rem;
		background: color-mix(in srgb, var(--color-background), transparent 8%);
	}

	.host-console__debug-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__debug-card {
		display: grid;
		align-content: start;
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: 0.45rem;
		background: color-mix(in srgb, var(--color-background), transparent 18%);
	}

	.host-console__debug-readout {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}

	.host-console__debug-readout strong {
		color: var(--color-text-strong);
		font-size: 1.35rem;
		line-height: 1;
		overflow-wrap: anywhere;
	}

	.host-console__debug-readout span {
		color: var(--color-text-soft);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
	}

	.host-console__meter {
		position: relative;
		height: 0.45rem;
		overflow: hidden;
		border-radius: 999px;
		background:
			linear-gradient(
				90deg,
				transparent calc(50% - 1px),
				var(--color-border-strong) calc(50% - 1px),
				var(--color-border-strong) calc(50% + 1px),
				transparent calc(50% + 1px)
			),
			var(--color-background);
	}

	.host-console__meter span {
		display: block;
		height: 100%;
		background: color-mix(in srgb, var(--color-info), var(--color-accent) 30%);
	}

	.host-console__meter--quality span {
		background: var(--color-success);
	}

	.host-console__debug-log {
		display: grid;
		gap: 0.4rem;
		min-width: 0;
	}

	.host-console__debug-row {
		display: grid;
		grid-template-columns: 4.5rem repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		align-items: center;
		min-width: 0;
		padding: 0.5rem 0.65rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		color: var(--color-text-soft);
		font-size: var(--font-size-xs);
		background: color-mix(in srgb, var(--color-background), transparent 8%);
	}

	.host-console__debug-row[data-safe='false'] {
		border-color: color-mix(in srgb, var(--color-success), var(--color-border) 70%);
	}

	.host-console__debug-row code {
		color: var(--color-text-strong);
		overflow-wrap: anywhere;
	}

	.host-console__input {
		width: 100%;
		min-height: 2.25rem;
		padding: 0 0.85rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 0.4rem;
		color: var(--color-text-strong);
		background: var(--color-background);
		font: inherit;
		font-size: var(--font-size-sm);
		min-width: 0;
	}

	.host-console__input:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (max-width: 58rem) {
		.host-console__grid {
			grid-template-columns: 1fr;
		}

		.host-console__header,
		.host-console__section-head {
			align-items: stretch;
			flex-direction: column;
		}

		.host-console__section-head {
			align-items: flex-start;
		}

		.host-console__actions {
			grid-template-columns: 1fr;
			width: 100%;
			min-width: 0;
		}

		.host-console__debug-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.host-console__pairing-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.host-console__debug-row {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.host-console__pairing-debug-row {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 34rem) {
		.host-console__debug-grid {
			grid-template-columns: 1fr;
		}

		.host-console__pairing-grid,
		.host-console__pairing-actions {
			grid-template-columns: 1fr;
		}

		.host-console__pairing-actions {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
