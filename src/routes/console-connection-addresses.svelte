<!--
	Purpose: route-local panel for Host, Quest, M5, and runtime connection URLs.
-->
<script lang="ts">
    import {
        ChevronDown,
        ExternalLink,
        Glasses,
        RadioTower,
        Router,
        Terminal,
    } from "@lucide/svelte";

    import { Collapsible, Kbd } from "$lib/components";
    import type { ConsoleConnectionUrls } from "./console-state.svelte";

    type Props = Readonly<{
        urls: ConsoleConnectionUrls;
    }>;

    let { urls }: Props = $props();
    let open = $state(true);
</script>

<article class="card network">
    <Collapsible.Root bind:open>
        <Collapsible.Trigger>
            <h2>Verbindungsadressen</h2>
            <ChevronDown size={16} aria-hidden="true" />
        </Collapsible.Trigger>
        <Collapsible.Content>
            <ul>
                <li>
                    <span><Glasses size={16} aria-hidden="true" /></span>
                    <div class="stack">
                        {urls.questLaunchUrl}
                    </div>
                </li>
                <li>
                    <span><ExternalLink size={16} aria-hidden="true" /></span>
                    <div>
                        {urls.experienceTargetUrl ??
                            "pending selected runtime client"}
                    </div>
                </li>
                <li>
                    <span><Terminal size={16} aria-hidden="true" /></span>
                    <div>
                        {urls.consoleUrl}
                    </div>
                </li>
                <li>
                    <span><RadioTower size={16} aria-hidden="true" /></span>
                    <div>
                        {urls.m5SocketUrl}
                    </div>
                </li>
                <li>
                    <span><Router size={16} aria-hidden="true" /></span>
                    <div>
                        {urls.runtimeSocketUrl}
                    </div>
                </li>
            </ul>
        </Collapsible.Content>
    </Collapsible.Root>
</article>
