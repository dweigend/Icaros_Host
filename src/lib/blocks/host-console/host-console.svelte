<!--
	Purpose: composed Icaros Host operator console. It keeps route files focused
	on data loading while this block owns page-specific presentation and actions.
-->
<script lang="ts">
	import {
		ChevronDown,
		CircleStop,
		ExternalLink,
		Glasses,
		Play,
		RadioTower,
		Router,
		Terminal
	} from '@lucide/svelte';

	import {
		Button,
		Collapsible,
		Kbd,
		StatusDot
	} from '$lib/components';
	import type { HostConsoleProps } from './types';

	let { connection, station }: HostConsoleProps = $props();

	let networkOpen = $state(true);
	let selectedExperienceId = $state('');

	const activeExperienceId = $derived(station.activeExperienceId);
	const consoleUrl = $derived(`${connection.httpOrigin}/`);
	const questLaunchUrl = $derived(connection.questLaunchUrl);
	const experienceTargetUrl = $derived(connection.experienceTargetUrl);
	const m5SocketUrl = $derived(`${connection.wsOrigin}/ws/device`);
	const runtimeSocketUrl = $derived(`${connection.wsOrigin}/ws/runtime`);

	$effect(() => {
		if (selectedExperienceId === '' && activeExperienceId !== null) {
			selectedExperienceId = activeExperienceId;
		}
	});
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

	<section class="host-console__grid" aria-label="Station overview">
		<article class="host-console__panel host-console__panel--primary">
			<div class="host-console__panel-head">
				<span class="host-console__label">active experience</span>
				<StatusDot
					tone={activeExperienceId === null ? 'default' : 'success'}
					label={activeExperienceId === null ? 'No active experience' : 'Experience active'}
				/>
			</div>
			<strong class="host-console__readout">{activeExperienceId ?? 'none'}</strong>
			<p class="host-console__copy">
				Nur diese Experience erhält normalisierte M5-Steuerdaten über den Runtime-Socket.
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
							<div>
								<Kbd>{questLaunchUrl}</Kbd>
								<span>Quest / Brille öffnet die aktive Experience</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<Terminal size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{consoleUrl}</Kbd>
								<span>Operator-Konsole</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<RadioTower size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{m5SocketUrl}</Kbd>
								<span>M5 Controller sendet Rohdaten</span>
							</div>
						</li>
						<li>
							<span class="host-console__endpoint-icon">
								<Router size={16} aria-hidden="true" />
							</span>
							<div>
								<Kbd>{runtimeSocketUrl}</Kbd>
								<span>Experience verbindet sich und registriert ihre ID</span>
							</div>
						</li>
					</ul>
					<p class="host-console__copy">
						Diese Adressen auf Geräten im selben LAN verwenden.
					</p>
				</Collapsible.Content>
			</Collapsible.Root>
		</article>
	</section>

	<section class="host-console__section" aria-labelledby="experience-title">
		<div class="host-console__section-head">
			<div>
				<p class="host-console__kicker">runtime routing</p>
				<h2 id="experience-title" class="host-console__section-title">Aktive Experience</h2>
			</div>

			<form class="host-console__actions" method="POST" action="?/setActive">
				<input
					class="host-console__input"
					name="experienceId"
					bind:value={selectedExperienceId}
					autocomplete="off"
					inputmode="text"
					pattern="[a-z0-9][a-z0-9-]*"
					placeholder="echo-flight"
					aria-label="Active experience id"
				/>
				<Button type="submit" variant="primary" disabled={selectedExperienceId === ''}>
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
				<Button href={questLaunchUrl} variant="secondary" target="_blank" rel="noreferrer">
					<ExternalLink size={16} aria-hidden="true" />
					Launch
				</Button>
			{/if}
		</div>

		<div class="host-console__routing-copy">
			<p class="host-console__copy">
				<Kbd>{questLaunchUrl}</Kbd>
				leitet zur laufenden Client-Seite
				<Kbd>{experienceTargetUrl ?? 'pending active experience'}</Kbd>
				weiter.
			</p>
			<p class="host-console__copy">
				Der aktive Client verbindet sich mit <Kbd>{runtimeSocketUrl}</Kbd> und erhält
				<code>control.orientation</code>.
			</p>
		</div>
	</section>
</main>

<style>
	.host-console {
		--endpoint-icon-size: 1.15rem;

		min-height: 100svh;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		padding: var(--space-4);
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
		gap: var(--space-3);
		padding-top: var(--space-3);
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
		grid-template-columns: minmax(16rem, 0.8fr) minmax(0, 1.2fr);
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
		align-content: start;
		min-height: 7rem;
		padding: var(--space-4);
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
	.host-console__section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-width: 0;
	}

	.host-console__readout {
		font-size: 1.85rem;
		line-height: 1;
		color: var(--color-text-strong);
		overflow-wrap: anywhere;
	}

	.host-console__copy,
	.host-console__mini-list {
		margin: 0;
		color: var(--color-text-soft);
		font-size: var(--font-size-sm);
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.host-console__mini-list {
		padding: 0;
		list-style: none;
	}

	.host-console__mini-list {
		display: grid;
		gap: var(--space-3);
	}

	.host-console__mini-list li {
		display: grid;
		grid-template-columns: var(--endpoint-icon-size) minmax(0, 1fr);
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
		display: inline-grid;
		place-items: center;
		width: var(--endpoint-icon-size);
		height: var(--endpoint-icon-size);
		align-self: start;
		margin-top: 0.15rem;
		color: color-mix(in srgb, var(--color-info), var(--color-text-soft) 20%);
		line-height: 1;
	}

	.host-console__endpoint-icon :global(svg) {
		width: 0.95rem;
		height: 0.95rem;
	}

	.host-console__section {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		min-width: 0;
	}

	.host-console__actions {
		display: grid;
		grid-template-columns: minmax(12rem, 1fr) auto;
		gap: 0.5rem;
		min-width: min(28rem, 100%);
	}

	.host-console__routing-copy {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}

	.host-console__input {
		width: 100%;
		min-height: 2.25rem;
		padding: 0 0.85rem;
		border: 1px solid var(--color-border-strong);
		border-radius: 0.4rem;
		color: var(--color-text-strong);
		background: var(--color-background);
		font: inherit;
		font-size: var(--font-size-sm);
		min-width: 0;
	}

	.host-console__input:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	@media (max-width: 58rem) {
		.host-console__grid {
			grid-template-columns: 1fr;
		}

		.host-console__header,
		.host-console__section-head {
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
	}
</style>
