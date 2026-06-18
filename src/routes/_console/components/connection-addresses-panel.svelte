<!--
	Purpose: route-private panel that displays Host connection URLs for the
	operator console. It renders data only and owns no runtime behavior.
-->
<script lang="ts">
	import type { HostConsoleConnectionUrls } from '../types';

	type Props = Readonly<{
		urls: HostConsoleConnectionUrls;
	}>;

	let { urls }: Props = $props();
</script>

<article class="card network">
	<h2>Verbindungsadressen</h2>
	<ul>
		<li><span>Quest</span><div class="stack">{urls.questLaunchUrl}</div></li>
		<li><span>Control</span><div>{urls.controlSocketUrl}</div></li>
		<li><span>Console</span><div>{urls.consoleUrl}</div></li>
		<li><span>M5</span><div>{urls.m5SocketUrl}</div></li>
		<li><span>Runtime</span><div>{urls.runtimeSocketUrl}</div></li>
	</ul>
</article>
