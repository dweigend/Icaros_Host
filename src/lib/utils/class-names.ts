/**
 * Purpose: compose optional CSS class values for local UI primitives. This is a
 * small adaptation of the ui-system helper so components can accept caller
 * classes without duplicating string-joining logic.
 */
function normalizeClassValue(value: unknown): string[] {
	if (!value) {
		return [];
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
		return [String(value)];
	}

	if (Array.isArray(value)) {
		return value.flatMap(normalizeClassValue);
	}

	if (typeof value === 'object') {
		return Object.entries(value)
			.filter(([, enabled]) => Boolean(enabled))
			.map(([className]) => className);
	}

	return [];
}

export function joinClassNames(...values: unknown[]): string {
	return values.flatMap(normalizeClassValue).join(' ');
}
