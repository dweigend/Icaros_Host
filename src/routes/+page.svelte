<!--
	Purpose: single-page Icaros Host console. It combines station status,
	experience selection, and technical runtime hints without separate UI routes.
-->
<script lang="ts">
	import { CircleStop, Play, RefreshCw, Server, Terminal } from '@lucide/svelte';

	import { Button, Kbd, Separator, StatusDot } from '$lib/components';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const activeExperienceId = $derived(data.station.activeExperienceId);
	const installedCount = $derived(data.discovery.experiences.length);
	const hasDiscoveryErrors = $derived(data.discovery.errors.length > 0);
</script>

<svelte:head>
	<title>Icaros Host Console</title>
</svelte:head>

<main class="terminal-page">
	<header class="terminal-header">
		<div class="terminal-title-block">
			<p class="terminal-kicker">station-a // local host console</p>
			<h1 class="terminal-title">
				<Terminal size={28} aria-hidden="true" />
				Icaros Host
			</h1>
		</div>

		<Button href="/" size="icon" aria-label="Refresh console">
			<RefreshCw size={18} aria-hidden="true" />
		</Button>
	</header>

	<section class="terminal-grid" aria-label="Station overview">
		<div class="terminal-panel terminal-panel-primary">
			<div class="terminal-panel-head">
				<span class="terminal-label">active experience</span>
				<StatusDot
					tone={activeExperienceId === null ? 'default' : 'success'}
					label={activeExperienceId === null ? 'No active experience' : 'Experience active'}
				/>
			</div>
			<strong class="terminal-readout">{activeExperienceId ?? 'waiting'}</strong>
			<p class="terminal-copy">
				Host owns station state. Experiences only receive normalized controls.
			</p>
		</div>

		<div class="terminal-panel">
			<span class="terminal-label">installed builds</span>
			<strong class="terminal-readout">{installedCount}</strong>
			<p class="terminal-copy">{data.discovery.rootDir}</p>
		</div>

		<div class="terminal-panel">
			<span class="terminal-label">network endpoints</span>
			<ul class="terminal-mini-list">
				<li>
					<Kbd>ws://host-ip:8787/ws/device</Kbd>
					<span>m5 raw input</span>
				</li>
				<li>
					<Kbd>ws://host-ip:8787/ws/runtime</Kbd>
					<span>normalized runtime stream</span>
				</li>
			</ul>
			<p class="terminal-copy">
				These are network WebSocket endpoints. They are not local file paths.
			</p>
		</div>
	</section>

	<Separator />

	<section class="terminal-section" aria-labelledby="experience-title">
		<div class="terminal-section-head">
			<div>
				<p class="terminal-kicker">manifest scan</p>
				<h2 id="experience-title" class="terminal-section-title">Installed Experiences</h2>
			</div>

			<form method="POST" action="?/setActive">
				<input type="hidden" name="experienceId" value="" />
				<Button type="submit" variant="ghost">
					<CircleStop size={16} aria-hidden="true" />
					Clear
				</Button>
			</form>
		</div>

		{#if installedCount === 0}
			<div class="terminal-empty">
				<Server size={20} aria-hidden="true" />
				<span>No valid experience manifests found.</span>
			</div>
		{:else}
			<ul class="terminal-list">
				{#each data.discovery.experiences as experience (experience.id)}
					<li class="terminal-row" data-active={experience.id === activeExperienceId}>
						<div class="terminal-row-main">
							<strong>{experience.title}</strong>
							<span>{experience.id} // {experience.mode} // {experience.requiredDevices.join('+')}</span>
						</div>

						<form method="POST" action="?/setActive">
							<input type="hidden" name="experienceId" value={experience.id} />
							<Button type="submit" variant="primary">
								<Play size={16} aria-hidden="true" />
								Start
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if hasDiscoveryErrors}
		<Separator />

		<section class="terminal-section" aria-labelledby="errors-title">
			<p class="terminal-kicker">scan warnings</p>
			<h2 id="errors-title" class="terminal-section-title">Discovery Errors</h2>
			<ul class="terminal-error-list">
				{#each data.discovery.errors as error (error)}
					<li>{error}</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
