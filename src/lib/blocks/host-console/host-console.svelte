<!--
	Purpose: composed Icaros Host operator console. It keeps route files focused
	on data loading while this block owns page-specific presentation and actions.
-->
<script lang="ts">
	import { CircleStop, Play, RefreshCw, Server, Terminal } from '@lucide/svelte';

	import { Button, Kbd, Separator, StatusDot } from '$lib/components';
	import type { HostConsoleProps } from './types';

	let { discovery, station }: HostConsoleProps = $props();

	const activeExperienceId = $derived(station.activeExperienceId);
	const installedCount = $derived(discovery.experiences.length);
	const hasDiscoveryErrors = $derived(discovery.errors.length > 0);

	const endpoints = [
		{
			description: 'm5 raw input',
			url: 'ws://host-ip:8787/ws/device'
		},
		{
			description: 'normalized runtime stream',
			url: 'ws://host-ip:8787/ws/runtime'
		}
	] as const;
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

		<Button href="/" size="icon" aria-label="Refresh console">
			<RefreshCw size={18} aria-hidden="true" />
		</Button>
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
			<strong class="host-console__readout">{activeExperienceId ?? 'waiting'}</strong>
			<p class="host-console__copy">
				Host owns station state. Experiences only receive normalized controls.
			</p>
		</article>

		<article class="host-console__panel">
			<span class="host-console__label">installed builds</span>
			<strong class="host-console__readout">{installedCount}</strong>
			<p class="host-console__copy">{discovery.rootDir}</p>
		</article>

		<article class="host-console__panel host-console__panel--network">
			<span class="host-console__label">network endpoints</span>
			<ul class="host-console__mini-list">
				{#each endpoints as endpoint (endpoint.url)}
					<li>
						<Kbd>{endpoint.url}</Kbd>
						<span>{endpoint.description}</span>
					</li>
				{/each}
			</ul>
			<p class="host-console__copy">
				These are network WebSocket endpoints. They are not local file paths.
			</p>
		</article>
	</section>

	<Separator />

	<section class="host-console__section" aria-labelledby="experience-title">
		<div class="host-console__section-head">
			<div>
				<p class="host-console__kicker">manifest scan</p>
				<h2 id="experience-title" class="host-console__section-title">Installed Experiences</h2>
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
			<div class="host-console__empty">
				<Server size={20} aria-hidden="true" />
				<span>No valid experience manifests found.</span>
			</div>
		{:else}
			<ul class="host-console__list">
				{#each discovery.experiences as experience (experience.id)}
					<li class="host-console__row" data-active={experience.id === activeExperienceId}>
						<div class="host-console__row-main">
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

		<section class="host-console__section" aria-labelledby="errors-title">
			<p class="host-console__kicker">scan warnings</p>
			<h2 id="errors-title" class="host-console__section-title">Discovery Errors</h2>
			<ul class="host-console__error-list">
				{#each discovery.errors as error (error)}
					<li>{error}</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style>
	.host-console {
		min-height: 100svh;
		display: grid;
		align-content: start;
		gap: 1rem;
		padding: 1rem;
	}

	.host-console__header,
	.host-console__grid,
	.host-console__section {
		width: min(var(--content-max-width), 100%);
		margin: 0 auto;
	}

	.host-console__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-top: 1rem;
	}

	.host-console__title-block {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.host-console__kicker,
	.host-console__label {
		margin: 0;
		font-size: 0.72rem;
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
		grid-template-columns: 1.25fr 0.75fr 1fr;
		gap: 0.75rem;
	}

	.host-console__panel,
	.host-console__section {
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--color-surface), transparent 4%);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035);
	}

	.host-console__panel {
		display: grid;
		gap: 0.85rem;
		min-height: 8rem;
		padding: 1rem;
	}

	.host-console__panel--primary {
		border-color: var(--color-accent-muted);
		background:
			linear-gradient(135deg, rgba(114, 230, 164, 0.08), transparent 45%),
			var(--color-surface);
	}

	.host-console__panel--network {
		border-color: color-mix(in srgb, var(--color-info), var(--color-border) 62%);
	}

	.host-console__panel-head,
	.host-console__section-head,
	.host-console__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.host-console__readout {
		font-size: 1.85rem;
		line-height: 1;
		color: var(--color-text-strong);
		overflow-wrap: anywhere;
	}

	.host-console__copy,
	.host-console__mini-list,
	.host-console__row-main span {
		margin: 0;
		color: var(--color-text-soft);
		font-size: 0.84rem;
	}

	.host-console__mini-list,
	.host-console__list,
	.host-console__error-list {
		padding: 0;
		list-style: none;
	}

	.host-console__mini-list {
		display: grid;
		gap: 0.5rem;
	}

	.host-console__mini-list li {
		display: grid;
		gap: 0.25rem;
	}

	.host-console__section {
		display: grid;
		gap: 1rem;
		padding: 1rem;
	}

	.host-console__list,
	.host-console__error-list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
	}

	.host-console__row {
		padding: 0.85rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-background);
	}

	.host-console__row[data-active='true'] {
		border-color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent), var(--color-background) 88%);
	}

	.host-console__row-main {
		display: grid;
		gap: 0.3rem;
		min-width: 0;
	}

	.host-console__row-main strong {
		color: var(--color-text-strong);
	}

	.host-console__empty {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 3rem;
		color: var(--color-text-soft);
	}

	.host-console__error-list {
		color: var(--color-danger);
	}

	@media (max-width: 58rem) {
		.host-console__grid {
			grid-template-columns: 1fr;
		}

		.host-console__header,
		.host-console__section-head,
		.host-console__row {
			align-items: stretch;
			flex-direction: column;
		}

		.host-console__section-head {
			align-items: flex-start;
		}

		.host-console__row form,
		.host-console__row :global(.ui-button) {
			width: 100%;
		}
	}
</style>
