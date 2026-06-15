/**
 * Purpose: small display formatters shared by Host console blocks and route
 * state preparation.
 */
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

export function toUnitPercent(value: number): number {
	return Math.round(((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100);
}

export function toQualityPercent(value: number): number {
	return Math.round(Math.max(0, Math.min(1, value)) * 100);
}
