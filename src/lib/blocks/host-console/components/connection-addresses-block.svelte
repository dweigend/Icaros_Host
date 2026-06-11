<!--
	Purpose: host console block for Host, Quest, M5, runtime, and control URLs.
-->
<script lang="ts">
	import { Activity, Glasses, RadioTower, Router, Terminal } from '@lucide/svelte';

	import type { HostConsoleConnectionUrls } from '../types';

    type Props = Readonly<{
        urls: HostConsoleConnectionUrls;
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
            <span><Activity size={16} aria-hidden="true" /></span>
            <div>
                {urls.controlSocketUrl}
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
