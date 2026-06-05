<!--
	Purpose: composed Icaros Host operator console. It keeps route files focused
	on data loading while this block owns page-specific presentation and actions.
-->
<script lang="ts">
	import { ChevronDown, CircleStop, MoreVertical, Play, RefreshCw, Server, Terminal } from '@lucide/svelte';

	import {
		Accordion,
		Button,
		Collapsible,
		DropdownMenu,
		Kbd,
		ScrollArea,
		Select,
		StatusDot,
		Switch,
		Tabs
	} from '$lib/components';
	import type { HostConsoleProps } from './types';

	let { discovery, station }: HostConsoleProps = $props();

	let activeTab = $state('overview');
	let compactMode = $state(false);
	let diagnosticPanels = $state<string[]>(['boundaries']);
	let networkOpen = $state(true);
	let selectedExperienceId = $state('');

	const activeExperienceId = $derived(station.activeExperienceId);
	const installedCount = $derived(discovery.experiences.length);
	const hasDiscoveryErrors = $derived(discovery.errors.length > 0);
	const experienceOptions = $derived(
		discovery.experiences.map((experience) => ({
			label: `${experience.title} // ${experience.id}`,
			value: experience.id
		}))
	);

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

	$effect(() => {
		if (selectedExperienceId === '' && station.activeExperienceId !== null) {
			selectedExperienceId = station.activeExperienceId;
		}
	});
</script>

<main class="host-console" data-compact={compactMode}>
	<header class="host-console__header">
		<div class="host-console__title-block">
			<p class="host-console__kicker">station-a // local host console</p>
			<h1 class="host-console__title">
				<Terminal size={24} aria-hidden="true" />
				Icaros Host
			</h1>
		</div>

		<div class="host-console__header-actions">
			<Switch
				bind:checked={compactMode}
				label="Compact"
				description="dense operator layout"
			/>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="ui-button ui-button--secondary ui-button--icon" aria-label="Console actions">
					<MoreVertical size={18} aria-hidden="true" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content sideOffset={8}>
						<DropdownMenu.Item textValue="Refresh" onSelect={() => window.location.assign('/')}>
							<RefreshCw size={15} aria-hidden="true" />
							Refresh console
						</DropdownMenu.Item>
						<DropdownMenu.Item textValue="Open overview" onSelect={() => (activeTab = 'overview')}>
							<Terminal size={15} aria-hidden="true" />
							Open overview
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
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

				<article class="host-console__panel">
					<span class="host-console__label">installed builds</span>
					<strong class="host-console__readout">{installedCount}</strong>
					<p class="host-console__copy host-console__token">{discovery.rootDir}</p>
				</article>

				<article class="host-console__panel host-console__panel--network">
					<Collapsible.Root bind:open={networkOpen}>
						<Collapsible.Trigger>
							<span class="host-console__label">network endpoints</span>
							<ChevronDown size={16} aria-hidden="true" />
						</Collapsible.Trigger>
						<Collapsible.Content>
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

					<form class="host-console__actions" method="POST" action="?/setActive">
						<input type="hidden" name="experienceId" value={selectedExperienceId} />
						<Select.Field
							bind:value={selectedExperienceId}
							ariaLabel="Choose active experience"
							disabled={installedCount === 0}
							options={experienceOptions}
							placeholder={installedCount === 0 ? 'No valid manifests' : 'Choose experience'}
						/>
						<Button type="submit" variant="primary" disabled={selectedExperienceId === ''}>
							<Play size={16} aria-hidden="true" />
							Start
						</Button>
					</form>

					<form method="POST" action="?/setActive">
						<input type="hidden" name="experienceId" value="" />
						<Button type="submit" variant="ghost">
							<CircleStop size={16} aria-hidden="true" />
							Clear
						</Button>
					</form>
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

				<Accordion.Root type="multiple" bind:value={diagnosticPanels}>
					<Accordion.Item value="scan">
						<Accordion.Header>
							<Accordion.Trigger>
								<span>Scan warnings</span>
								<StatusDot
									tone={hasDiscoveryErrors ? 'danger' : 'success'}
									label={hasDiscoveryErrors ? 'Scan warnings available' : 'No scan warnings'}
								/>
							</Accordion.Trigger>
						</Accordion.Header>
						<Accordion.Content>
							<ScrollArea class="host-console__scroll-area">
								{#if hasDiscoveryErrors}
									<ul class="host-console__error-list">
										{#each discovery.errors as error (error)}
											<li>{error}</li>
										{/each}
									</ul>
								{:else}
									<p class="host-console__copy">No discovery errors reported.</p>
								{/if}
							</ScrollArea>
						</Accordion.Content>
					</Accordion.Item>

					<Accordion.Item value="boundaries">
						<Accordion.Header>
							<Accordion.Trigger>Runtime boundaries</Accordion.Trigger>
						</Accordion.Header>
						<Accordion.Content>
							<ul class="host-console__boundary-list">
								<li>M5 raw frames terminate at the host.</li>
								<li>Experiences receive normalized controls only.</li>
								<li>Active state is stored as activeExperienceId for station-a.</li>
							</ul>
						</Accordion.Content>
					</Accordion.Item>
				</Accordion.Root>
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

	.host-console__header-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
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
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.75fr) minmax(0, 1fr);
		gap: 0.75rem;
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
		gap: 0.85rem;
		min-height: 8rem;
		padding: 1rem;
		min-width: 0;
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
		font-size: 0.84rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.host-console__token {
		overflow-wrap: anywhere;
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
		min-width: 0;
	}

	.host-console__mini-list span {
		overflow-wrap: anywhere;
	}

	.host-console__section {
		display: grid;
		gap: 1rem;
		padding: 1rem;
		min-width: 0;
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

	.host-console__error-list {
		color: var(--color-danger);
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

	.host-console[data-compact='true'] {
		gap: 0.65rem;
	}

	.host-console[data-compact='true'] .host-console__panel,
	.host-console[data-compact='true'] .host-console__section {
		gap: 0.55rem;
		min-height: auto;
		padding: 0.75rem;
	}

	.host-console[data-compact='true'] .host-console__readout {
		font-size: 1.45rem;
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

		.host-console__header-actions {
			align-items: stretch;
			width: 100%;
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
