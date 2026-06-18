/**
 * Purpose: small display formatters for route-private Host console panels.
 * Values are presentation-only and never alter protocol data.
 */
import type { RuntimeClientSummary } from '$lib/protocol';

export function formatSignedUnit(value: number): string {
	const sign = value > 0 ? '+' : '';
	return `${sign}${value.toFixed(3)}`;
}

export function formatAge(milliseconds: number): string {
	if (milliseconds < 1_000) {
		return `${Math.max(0, Math.round(milliseconds))} ms`;
	}

	return `${(milliseconds / 1_000).toFixed(1)} s`;
}

export function formatRuntimeClientId(clientId: string): string {
	return clientId.length <= 12 ? clientId : `${clientId.slice(0, 8)}...${clientId.slice(-4)}`;
}

export function formatRuntimeClientSeen(client: RuntimeClientSummary, now: number): string {
	return formatAge(now - client.lastSeenAt);
}

export function toQualityPercent(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function toUnitPercent(value: number): number {
	return Math.round(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
}
