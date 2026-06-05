<!--
	Purpose: single-page Icaros Host operator console. Route data stays in
	+page.server.ts; this file owns the page-specific frontend markup.
-->
<script lang="ts">
    import { invalidateAll } from "$app/navigation";
    import {
        ChevronDown,
        CircleStop,
        ExternalLink,
        Gauge,
        Glasses,
        Play,
        PlugZap,
        RadioTower,
        Router,
        Terminal,
    } from "@lucide/svelte";
    import { onMount } from "svelte";

    import {
        Button,
        Collapsible,
        Kbd,
        StatusDot,
        Switch,
    } from "$lib/components";
    import type { ControlOrientation } from "$lib/protocol";
    import type { PageProps } from "./$types";
    import {
        createRuntimeDebugFrame,
        formatAge,
        formatSignedUnit,
        parseRuntimeDebugMessage,
        toQualityPercent,
        toUnitPercent,
        type RuntimeDebugFrame,
        type RuntimeDebugStatus,
    } from "./runtime-debug";

    const DEBUG_FRAME_LIMIT = 12;
    const DEBUG_CLIENT_ID = "host-console-debug";

    let { data }: PageProps = $props();

    let networkOpen = $state(true);
    let selectedExperienceId = $state("");
    let usbSsid = $state("");
    let usbPassword = $state("");
    let usbDeviceId = $state("icaros-station-a-m5");
    let usbStaticIp = $state("");
    let usbGateway = $state("");
    let usbSubnet = $state("");
    let usbDns = $state("");
    let usbNow = $state(Date.now());
    let debugStatus = $state<RuntimeDebugStatus>("disconnected");
    let debugSocketOpen = $state(false);
    let debugNow = $state(Date.now());
    let debugLastMessageAt = $state<number | null>(null);
    let debugFrameCount = $state(0);
    let debugStationActiveExperienceId = $state<string | null | undefined>(
        undefined,
    );
    let debugLastControl = $state<ControlOrientation | null>(null);
    let debugFrames = $state<RuntimeDebugFrame[]>([]);
    let debugSocket: WebSocket | null = null;

    const connection = $derived(data.connection);
    const station = $derived(data.station);
    const usbSetup = $derived(data.usbSetup);
    const activeExperienceId = $derived(station.activeExperienceId);
    const consoleUrl = $derived(`${connection.httpOrigin}/`);
    const questLaunchUrl = $derived(connection.questLaunchUrl);
    const experienceTargetUrl = $derived(connection.experienceTargetUrl);
    const m5SocketUrl = $derived(connection.pairedDeviceUrl);
    const runtimeSocketUrl = $derived(`${connection.wsOrigin}/ws/runtime`);
    const debugTargetExperienceId = $derived(
        debugStationActiveExperienceId === undefined
            ? activeExperienceId
            : debugStationActiveExperienceId,
    );
    const debugStatusTone = $derived(readDebugStatusTone(debugStatus));
    const debugLastMessageAge = $derived(
        debugLastMessageAt === null
            ? "never"
            : formatAge(debugNow - debugLastMessageAt),
    );
    const debugPitchPercent = $derived(
        toUnitPercent(debugLastControl?.pitch ?? 0),
    );
    const debugRollPercent = $derived(
        toUnitPercent(debugLastControl?.roll ?? 0),
    );
    const debugQualityPercent = $derived(
        toQualityPercent(debugLastControl?.quality ?? 0),
    );
    const usbSetupTone = $derived(readUsbSetupTone(usbSetup.state));
    const usbSetupDuration = $derived(
        formatUsbSetupDuration(usbSetup.startedAt, usbSetup.finishedAt, usbNow),
    );
    const usbSetupBusy = $derived(isUsbSetupBusy(usbSetup.state));
    const usbLastFrameAge = $derived(
        usbSetup.lastFrameAt === null
            ? "never"
            : formatAge(usbNow - usbSetup.lastFrameAt),
    );

    $effect(() => {
        if (selectedExperienceId === "" && activeExperienceId !== null) {
            selectedExperienceId = activeExperienceId;
        }
    });

    onMount(() => {
        debugSocket = new WebSocket(runtimeSocketUrl);
        const clock = window.setInterval(() => {
            debugNow = Date.now();
            usbNow = Date.now();
        }, 250);

        debugStatus = "connecting";

        debugSocket.onopen = () => {
            debugStatus = "connected";
            debugSocketOpen = true;
            if (debugSocket !== null) {
                registerDebugTap(debugSocket);
            }
        };

        debugSocket.onmessage = (event: MessageEvent) => {
            readDebugMessage(String(event.data));
        };

        debugSocket.onerror = () => {
            debugStatus = "error";
        };

        debugSocket.onclose = () => {
            debugSocketOpen = false;
            debugStatus = "disconnected";
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

        const socket = debugSocket;

        if (socket !== null) {
            registerDebugTap(socket);
        }
    });

    function readDebugMessage(data: string): void {
        const message = parseRuntimeDebugMessage(data);

        if (message === null) {
            return;
        }

        const receivedAt = Date.now();
        debugLastMessageAt = receivedAt;

        if (message.type === "station.state") {
            debugStationActiveExperienceId = message.payload.activeExperienceId;
            return;
        }

        debugLastControl = message.payload;
        debugFrameCount += 1;
        debugFrames = [
            createRuntimeDebugFrame(
                debugFrameCount,
                message.payload,
                receivedAt,
            ),
            ...debugFrames,
        ].slice(0, DEBUG_FRAME_LIMIT);
    }

    function registerDebugTap(socket: WebSocket): void {
        if (socket.readyState !== WebSocket.OPEN) {
            return;
        }

        socket.send(
            JSON.stringify({
                type: "client.register",
                payload: { role: "operator", id: DEBUG_CLIENT_ID },
            }),
        );
    }

    function readDebugStatusTone(
        status: RuntimeDebugStatus,
    ): "default" | "success" | "warning" | "danger" {
        if (status === "connected") {
            return "success";
        }

        if (status === "connecting") {
            return "warning";
        }

        if (status === "error") {
            return "danger";
        }

        return "default";
    }

    function readUsbSetupTone(
        state: typeof usbSetup.state,
    ): "default" | "success" | "warning" | "danger" {
        if (state === "ready") {
            return "success";
        }

        if (isUsbSetupBusy(state)) {
            return "warning";
        }

        if (state === "failed") {
            return "danger";
        }

        return "default";
    }

    function formatUsbSetupDuration(
        startedAt: number | null,
        finishedAt: number | null,
        now: number,
    ): string {
        if (startedAt === null) {
            return "not run";
        }

        return formatAge((finishedAt ?? now) - startedAt);
    }

    function isUsbSetupBusy(state: typeof usbSetup.state): boolean {
        return (
            state === "usb_connected" ||
            state === "firmware_check" ||
            state === "firmware_update" ||
            state === "configure" ||
            state === "usb_test" ||
            state === "wlan_test"
        );
    }
</script>

<svelte:head>
    <title>Icaros Host Console</title>
</svelte:head>

<main class="host-console">
    <header class="host-console__header">
        <h1>Icaros Host</h1>
    </header>

    <section class="host-console__grid" aria-label="Station overview">
        <article class="host-console__panel host-console__panel--primary">
            <div class="host-console__panel-head">
                <span class="host-console__label">active experience</span>
                <StatusDot
                    tone={activeExperienceId === null ? "default" : "success"}
                    label={activeExperienceId === null
                        ? "No active experience"
                        : "Experience active"}
                />
            </div>
            <strong class="host-console__readout"
                >{activeExperienceId ?? "none"}</strong
            >
            <p class="host-console__copy">
                Nur diese Experience erhält normalisierte M5-Steuerdaten über
                den Runtime-Socket.
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
                            <div class="host-console__endpoint-copy">
                                <Kbd>{questLaunchUrl}</Kbd>
                                <span>Quest Launch URL (Host)</span>
                            </div>
                        </li>
                        <li>
                            <span class="host-console__endpoint-icon">
                                <ExternalLink size={16} aria-hidden="true" />
                            </span>
                            <div class="host-console__endpoint-copy">
                                <Kbd
                                    >{experienceTargetUrl ??
                                        "pending active experience"}</Kbd
                                >
                                <span>Experience URL (Client)</span>
                            </div>
                        </li>
                        <li>
                            <span class="host-console__endpoint-icon">
                                <Terminal size={16} aria-hidden="true" />
                            </span>
                            <div class="host-console__endpoint-copy">
                                <Kbd>{consoleUrl}</Kbd>
                                <span>Operator-Konsole</span>
                            </div>
                        </li>
                        <li>
                            <span class="host-console__endpoint-icon">
                                <RadioTower size={16} aria-hidden="true" />
                            </span>
                            <div class="host-console__endpoint-copy">
                                <Kbd>{m5SocketUrl}</Kbd>
                                <span>M5 Controller sendet Rohdaten</span>
                            </div>
                        </li>
                        <li>
                            <span class="host-console__endpoint-icon">
                                <Router size={16} aria-hidden="true" />
                            </span>
                            <div class="host-console__endpoint-copy">
                                <Kbd>{runtimeSocketUrl}</Kbd>
                                <span>Runtime WebSocket Proxy zum Host</span>
                            </div>
                        </li>
                    </ul>
                </Collapsible.Content>
            </Collapsible.Root>
        </article>
    </section>

    <section class="host-console__section" aria-labelledby="experience-title">
        <div class="host-console__section-head">
            <div>
                <p class="host-console__kicker">Aktive Experience</p>
            </div>

            <form
                class="host-console__actions"
                method="POST"
                action="?/setActive"
            >
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
                <Button
                    type="submit"
                    variant="primary"
                    disabled={selectedExperienceId === ""}
                >
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
                <Button
                    href={questLaunchUrl}
                    variant="secondary"
                    target="_blank"
                    rel="noreferrer"
                >
                    <ExternalLink size={16} aria-hidden="true" />
                    Host Launch
                </Button>
            {/if}
        </div>

        <div class="host-console__routing-copy">
            <p class="host-console__copy">
                Quest Launch URL (Host) <Kbd>{questLaunchUrl}</Kbd> leitet zur Experience
                URL (Client) <Kbd
                    >{experienceTargetUrl ?? "pending active experience"}</Kbd
                > weiter.
            </p>
            <p class="host-console__copy">
                Runtime WebSocket Proxy <Kbd>/ws/runtime</Kbd> zum Host: <Kbd
                    >{runtimeSocketUrl}</Kbd
                >. Der aktive Client erhält <code>control.orientation</code>.
            </p>
        </div>
    </section>

    <section class="host-console__section" aria-labelledby="usb-title">
        <div class="host-console__section-head">
            <div>
                <p class="host-console__kicker">Controller einrichten</p>
            </div>
            <div class="host-console__debug-status">
                <StatusDot
                    tone={usbSetupTone}
                    label={`USB setup ${usbSetup.state}`}
                />
                <span>{usbSetup.state}</span>
            </div>
            <form method="POST" action="?/setPairingDebug">
                <input
                    type="hidden"
                    name="enabled"
                    value={usbSetup.debugEnabled ? "false" : "true"}
                />
                <div>
                    <Switch
                        checked={usbSetup.debugEnabled}
                        label="Debug"
                        description={usbSetup.debugEnabled ? "Ein" : "Aus"}
                        onclick={(event) =>
                            event.currentTarget
                                .closest("form")
                                ?.requestSubmit()}
                    />
                </div>
            </form>
        </div>

        <div class="host-console__routing-copy">
            <p class="host-console__copy">
                Laufzeit: {usbSetupDuration}
                {#if usbSetup.exitCode !== null}
                    // exit {usbSetup.exitCode}
                {/if}
            </p>
        </div>

        <form
            class="host-console__pairing-form"
            method="POST"
            action="?/connectUsb"
        >
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
                    disabled={usbSetupBusy ||
                        usbSsid.trim() === "" ||
                        usbPassword === ""}
                >
                    <PlugZap size={16} aria-hidden="true" />
                    {usbSetupBusy ? "Läuft" : "Pairing einrichten"}
                </Button>
            </div>
        </form>

        <div
            class="host-console__pairing-status"
            aria-label="M5 pairing status"
        >
            <div class="host-console__progress" aria-label="Pairing progress">
                <span style:width={`${usbSetup.progress}%`}></span>
            </div>
            <div
                class="host-console__pairing-grid host-console__pairing-grid--status"
            >
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
                    <strong>{usbSetup.firmwareVersion ?? "pending"}</strong>
                </div>
                <div>
                    <span>USB</span>
                    <strong>{usbSetup.usbOk ? "ok" : "pending"}</strong>
                </div>
                <div>
                    <span>WLAN/WebSocket</span>
                    <strong>{usbSetup.wlanOk ? "ok" : "pending"}</strong>
                </div>
                <div>
                    <span>Letztes Frame</span>
                    <strong>{usbLastFrameAge}</strong>
                </div>
            </div>
            <p class="host-console__copy">
                {usbSetup.error ?? usbSetup.message}
            </p>

            {#if usbSetup.debugEnabled}
                <div class="host-console__debug-note">
                    <p class="host-console__copy">
                        Debug aktiv. Snapshot für LLMs: <Kbd
                            >.icaros/debug/m5-pairing-debug.json</Kbd
                        >
                    </p>
                </div>
                <div
                    class="host-console__pairing-debug"
                    aria-label="M5 pairing debug lines"
                >
                    {#each usbSetup.debugLines as line (line.id)}
                        <div
                            class="host-console__pairing-debug-row"
                            data-source={line.source}
                        >
                            <span
                                >{new Date(
                                    line.timestamp,
                                ).toLocaleTimeString()}</span
                            >
                            <code>{line.source}</code>
                            <span>{line.message}</span>
                        </div>
                    {:else}
                        <p class="host-console__copy">
                            Noch keine Debug-Ereignisse.
                        </p>
                    {/each}
                </div>
            {/if}
        </div>
    </section>

    <section class="host-console__section" aria-labelledby="debug-title">
        <div class="host-console__section-head">
            <div class="host-console__debug-status">
                <StatusDot
                    tone={debugStatusTone}
                    label={`Runtime debug ${debugStatus}`}
                />
                <span>{debugStatus}</span>
            </div>
        </div>

        <div class="host-console__debug-grid">
            <article class="host-console__debug-card">
                <span class="host-console__label">last control</span>
                <div class="host-console__debug-readout">
                    <strong
                        >{debugLastControl === null
                            ? "no frame"
                            : formatSignedUnit(debugLastControl.pitch)}</strong
                    >
                    <span>pitch</span>
                </div>
                <div class="host-console__meter" aria-label="Pitch">
                    <span style:width={`${debugPitchPercent}%`}></span>
                </div>
            </article>

            <article class="host-console__debug-card">
                <span class="host-console__label">roll</span>
                <div class="host-console__debug-readout">
                    <strong
                        >{debugLastControl === null
                            ? "no frame"
                            : formatSignedUnit(debugLastControl.roll)}</strong
                    >
                    <span>roll</span>
                </div>
                <div class="host-console__meter" aria-label="Roll">
                    <span style:width={`${debugRollPercent}%`}></span>
                </div>
            </article>

            <article class="host-console__debug-card">
                <span class="host-console__label">quality</span>
                <div class="host-console__debug-readout">
                    <strong>{debugQualityPercent}%</strong>
                    <span
                        >{debugLastControl?.safeMode
                            ? "safe mode"
                            : "live"}</span
                    >
                </div>
                <div
                    class="host-console__meter host-console__meter--quality"
                    aria-label="Quality"
                >
                    <span style:width={`${debugQualityPercent}%`}></span>
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
                    {debugTargetExperienceId ?? "no active experience"}
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
                    <span>{frame.safeMode ? "safe" : "live"}</span>
                </div>
            {:else}
                <p class="host-console__copy">
                    Noch keine <code>control.orientation</code>-Frames
                    empfangen.
                </p>
            {/each}
        </div>
    </section>
</main>
