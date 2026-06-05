<!--
	Purpose: composed Icaros Host operator console. It keeps route files focused
	on data loading while this block owns page-specific presentation and actions.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import {
		ChevronDown,
		CircleStop,
		Glasses,
		Play,
		RadioTower,
		Router,
		Server,
		Terminal
	} from '@lucide/svelte';

	import {
		Button,
		Collapsible,
		Kbd,
		ScrollArea,
		Select,
		StatusDot,
		Tabs
	} from '$lib/components';
	import type { HostConsoleProps } from './types';

	let { discovery, station }: HostConsoleProps = $props();

	let activeTab = $state('overview');
	let networkOpen = $state(true);
	let selectedExperienceId = $state('');

	const activeExperienceId = $derived(station.activeExperienceId);
	const installedCount = $derived(discovery.experiences.length);
	const experienceOptions = $derived(
		discovery.experiences.map((experience) => ({
			label: `${experience.title} // ${experience.id}`,
			value: experience.id
		}))
	);

	const publicHost = $derived.by(() => {
		if (!browser) {
			return '<host-lan-ip>:3000';
		}

		const portSuffix = window.location.port === '' ? '' : `:${window.location.port}`;
		return `<host-lan-ip>${portSuffix}`;
	});
	const questUrl = $derived(`http://${publicHost}/`);
	const m5SocketUrl = $derived(`ws://${publicHost}/ws/device`);
	const runtimeSocketUrl = $derived(`ws://${publicHost}/ws/runtime`);
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

	<Tabs.Root bind:value={activeTab} activationMode="manual">
		<Tabs.List aria-label="Console views">
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="experiences">Experiences</Tabs.Trigger>
			<Tabs.Trigger value="diagnostics">Diagnostics</Tabs.Trigger>
		</Tabs.List>

		<Tabs.Content value="overview">
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

				<article class="host-console__panel host-console__panel--network">
					<Collapsible.Root bind:open={networkOpen}>
						<Collapsible.Trigger>
							<span class="host-console__label">network endpoints</span>
							<ChevronDown size={16} aria-hidden="true" />
						</Collapsible.Trigger>
						<Collapsible.Content>
							<ul class="host-console__mini-list">
								<li>
									<span class="host-console__endpoint-icon ui-icon-bare">
										<Glasses size={16} aria-hidden="true" />
									</span>
									<div>
										<Kbd>{questUrl}</Kbd>
										<span>Quest / Brille öffnet die Host-Startseite</span>
									</div>
								</li>
								<li>
									<span class="host-console__endpoint-icon ui-icon-bare">
										<RadioTower size={16} aria-hidden="true" />
									</span>
									<div>
										<Kbd>{m5SocketUrl}</Kbd>
										<span>M5 Controller sendet rohe JSON-Frames</span>
									</div>
								</li>
								<li>
									<span class="host-console__endpoint-icon ui-icon-bare">
										<Router size={16} aria-hidden="true" />
									</span>
									<div>
										<Kbd>{runtimeSocketUrl}</Kbd>
										<span>Experience-Client empfängt normalisierte Controls</span>
									</div>
								</li>
							</ul>
							<p class="host-console__copy">
								Use the LAN IP of this host machine. Do not enter 0.0.0.0 on Quest or M5.
							</p>
						</Collapsible.Content>
					</Collapsible.Root>
				</article>
			</section>
		</Tabs.Content>

		<Tabs.Content value="experiences">
			<section class="host-console__section" aria-labelledby="experience-title">
				<div class="host-console__section-head">
					<div>
						<p class="host-console__kicker">manifest scan</p>
						<h2 id="experience-title" class="host-console__section-title">Installed Experiences</h2>
					</div>

					{#if installedCount > 0}
						<form class="host-console__actions" method="POST" action="?/setActive">
							<input type="hidden" name="experienceId" value={selectedExperienceId} />
							<Select.Field
								bind:value={selectedExperienceId}
								ariaLabel="Choose active experience"
								options={experienceOptions}
								placeholder="Choose experience"
							/>
							<Button type="submit" variant="primary" disabled={selectedExperienceId === ''}>
								<Play size={16} aria-hidden="true" />
								Start
							</Button>
						</form>
					{/if}

					{#if activeExperienceId !== null}
						<form method="POST" action="?/setActive">
							<input type="hidden" name="experienceId" value="" />
							<Button type="submit" variant="ghost">
								<CircleStop size={16} aria-hidden="true" />
								Clear
							</Button>
						</form>
					{/if}
				</div>

				<ScrollArea class="host-console__scroll-area">
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
								</li>
							{/each}
						</ul>
					{/if}
				</ScrollArea>
			</section>
		</Tabs.Content>

		<Tabs.Content value="diagnostics">
			<section class="host-console__section" aria-labelledby="diagnostics-title">
				<p class="host-console__kicker">system diagnostics</p>
				<h2 id="diagnostics-title" class="host-console__section-title">Diagnostics</h2>

				<div class="host-console__diagnostic-block">
					<span class="host-console__label">Runtime boundaries</span>
					<ul class="host-console__boundary-list">
						<li>M5 raw frames terminate at the host.</li>
						<li>Experiences receive normalized controls only.</li>
						<li>Active state is stored as activeExperienceId for station-a.</li>
					</ul>
				</div>
			</section>
		</Tabs.Content>
	</Tabs.Root>
</main>

<style>
	.host-console {
		min-height: 100svh;
		display: grid;
		align-content: start;
		gap: 1rem;
		padding: 1rem;
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
		gap: 1rem;
		padding-top: 1rem;
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
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
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
		min-height: 6.75rem;
		padding: var(--space-3);
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
	.host-console__section-head,
	.host-console__row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		min-width: 0;
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
		font-size: var(--font-size-sm);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.host-console__mini-list,
	.host-console__list {
		padding: 0;
		list-style: none;
	}

	.host-console__mini-list {
		display: grid;
		gap: var(--space-2);
	}

	.host-console__mini-list li {
		display: grid;
		grid-template-columns: var(--icon-bare-size) minmax(0, 1fr);
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
		align-self: start;
		margin-top: 0.15rem;
		color: color-mix(in srgb, var(--color-info), var(--color-text-soft) 20%);
	}

	.host-console__section {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		min-width: 0;
	}

	.host-console__list {
		display: grid;
		gap: 0.5rem;
		margin: 0;
	}

	.host-console__row {
		padding: 0.85rem;
		border: 1px solid var(--color-border);
		border-radius: 0.4rem;
		background: var(--color-background);
		min-width: 0;
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
		overflow-wrap: anywhere;
	}

	.host-console__empty {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 3rem;
		color: var(--color-text-soft);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.host-console__actions {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto;
		gap: 0.5rem;
		min-width: min(28rem, 100%);
	}

	:global(.host-console__scroll-area) {
		max-height: 18rem;
		min-width: 0;
	}

	.host-console__boundary-list {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding-left: 1rem;
		overflow-wrap: anywhere;
	}

	.host-console__diagnostic-block {
		display: grid;
		gap: 0.75rem;
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

		.host-console__actions {
			grid-template-columns: 1fr;
			width: 100%;
			min-width: 0;
		}

		.host-console__row :global(.ui-button) {
			width: 100%;
		}
	}
</style>
