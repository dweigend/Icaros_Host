<!--
	Purpose: route-local panel for Host, Quest, M5, and runtime connection URLs.
-->
<script lang="ts">
    import { ExternalLink, Glasses, RadioTower, Router, Terminal } from "@lucide/svelte";

    import type { ConsoleConnectionUrls } from "./console-state.svelte";

    type Props = Readonly<{
        urls: ConsoleConnectionUrls;
    }>;

    let { urls }: Props = $props();
</script>

<article class="card network">
    <h2>Verbindungsadressen</h2>
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
                {urls.experienceTargetUrl ?? "pending selected runtime client"}
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
</article>
