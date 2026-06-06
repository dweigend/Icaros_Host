<!--
	Purpose: route-local M5 USB pairing form, status, and bounded debug output.
-->
<script lang="ts">
    import { PlugZap } from "@lucide/svelte";

    import {
        Button,
        Kbd,
        ScrollArea,
        StatusDot,
        Switch,
    } from "$lib/components";
    import type { ConsolePageState } from "./console-state.svelte";

    type Props = Readonly<{
        state: ConsolePageState;
    }>;

    let { state }: Props = $props();
</script>

<section class="card" aria-labelledby="usb-title">
    <div class="row">
        <h2 id="usb-title">Controller einrichten</h2>
        <div class="status">
            <StatusDot
                tone={state.usbSetupTone}
                label={`USB setup ${state.usbSetup.state}`}
            />
            <span>{state.usbSetup.state}</span>
        </div>
        <form method="POST" action="?/setPairingDebug">
            <input
                type="hidden"
                name="enabled"
                value={state.usbSetup.debugEnabled ? "false" : "true"}
            />
            <Switch
                checked={state.usbSetup.debugEnabled}
                label="Debug"
                description={state.usbSetup.debugEnabled ? "Ein" : "Aus"}
                onclick={(event) =>
                    event.currentTarget.closest("form")?.requestSubmit()}
            />
        </form>
    </div>

    <p>
        Laufzeit: {state.usbSetupDuration}
        {#if state.usbSetup.exitCode !== null}
            // exit {state.usbSetup.exitCode}
        {/if}
    </p>

    <form class="stack" method="POST" action="?/connectUsb">
        <div class="form-grid">
            <label>
                <span>SSID</span>
                <input
                    name="ssid"
                    bind:value={state.usbForm.ssid}
                    autocomplete="off"
                />
            </label>
            <label>
                <span>WiFi Passwort</span>
                <input
                    type="password"
                    name="password"
                    bind:value={state.usbForm.password}
                    autocomplete="off"
                />
            </label>
            <label>
                <span>Device ID</span>
                <input
                    name="deviceId"
                    bind:value={state.usbForm.deviceId}
                    autocomplete="off"
                />
            </label>
            <label>
                <span>Statische IP</span>
                <input
                    name="staticIp"
                    bind:value={state.usbForm.staticIp}
                    autocomplete="off"
                    inputmode="decimal"
                    placeholder="optional"
                />
            </label>
            <label>
                <span>Gateway</span>
                <input
                    name="gateway"
                    bind:value={state.usbForm.gateway}
                    autocomplete="off"
                    inputmode="decimal"
                    placeholder="optional"
                />
            </label>
            <label>
                <span>Subnetz</span>
                <input
                    name="subnet"
                    bind:value={state.usbForm.subnet}
                    autocomplete="off"
                    inputmode="decimal"
                    placeholder="255.255.255.0"
                />
            </label>
            <label>
                <span>DNS</span>
                <input
                    name="dns"
                    bind:value={state.usbForm.dns}
                    autocomplete="off"
                    inputmode="decimal"
                    placeholder="optional"
                />
            </label>
        </div>

        <div class="actions">
            <Button
                type="submit"
                variant="primary"
                disabled={state.usbSetupBusy ||
                    state.usbForm.ssid.trim() === "" ||
                    state.usbForm.password === ""}
            >
                <PlugZap size={16} aria-hidden="true" />
                {state.usbSetupBusy ? "Läuft" : "Pairing einrichten"}
            </Button>
        </div>
    </form>

    <div class="stack" aria-label="M5 pairing status">
        <div class="progress" aria-label="Pairing progress">
            <span style:width={`${state.usbSetup.progress}%`}></span>
        </div>
        <div class="stats">
            <div>
                <span>Schritt</span><strong>{state.usbSetup.step}</strong>
            </div>
            <div>
                <span>Fortschritt</span><strong
                    >{state.usbSetup.progress}%</strong
                >
            </div>
            <div>
                <span>Device ID</span><strong
                    >{state.usbSetup.deviceId ?? state.usbForm.deviceId}</strong
                >
            </div>
            <div>
                <span>Firmware</span><strong
                    >{state.usbSetup.firmwareVersion ?? "pending"}</strong
                >
            </div>
            <div>
                <span>USB</span><strong
                    >{state.usbSetup.usbOk ? "ok" : "pending"}</strong
                >
            </div>
            <div>
                <span>WLAN/WebSocket</span><strong
                    >{state.usbSetup.wlanOk ? "ok" : "pending"}</strong
                >
            </div>
            <div>
                <span>Letztes Frame</span><strong
                    >{state.usbLastFrameAge}</strong
                >
            </div>
        </div>
        <p>{state.usbSetup.error ?? state.usbSetup.message}</p>

        {#if state.usbSetup.debugEnabled}
            <p>
                Debug aktiv. Snapshot für LLMs: <Kbd
                    >.icaros/debug/m5-pairing-debug.json</Kbd
                >
            </p>
            <ScrollArea class="log" aria-label="M5 pairing debug lines">
                {#each state.usbSetup.debugLines as line (line.id)}
                    <div class="log-row pairing" data-source={line.source}>
                        <span
                            >{new Date(
                                line.timestamp,
                            ).toLocaleTimeString()}</span
                        >
                        <code>{line.source}</code>
                        <span>{line.message}</span>
                    </div>
                {:else}
                    <p>Noch keine Debug-Ereignisse.</p>
                {/each}
            </ScrollArea>
        {/if}
    </div>
</section>
