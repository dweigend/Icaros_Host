/**
 * Purpose: shared metadata for the local status-dot primitive.
 */
export const statusDotFamily = 'status-dot';

export const statusDotToneClassByTone = {
	default: '',
	success: 'ui-status-dot--success',
	warning: 'ui-status-dot--warning',
	danger: 'ui-status-dot--danger'
} as const;
