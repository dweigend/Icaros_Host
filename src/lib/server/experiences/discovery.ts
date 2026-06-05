/**
 * Purpose: filesystem-backed experience discovery for M1. It scans finished
 * dist folders and validates manifests before routes or UI expose them.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type ExperienceManifest, validateExperienceManifest } from '$lib/protocol';

const DEFAULT_EXPERIENCES_DIR = 'experiences';

export type ExperienceDiscoveryResult = Readonly<{
	experiences: readonly ExperienceManifest[];
	errors: readonly string[];
	rootDir: string;
}>;

function getExperiencesDir(): string {
	return process.env.ICAROS_EXPERIENCES_DIR ?? join(process.cwd(), DEFAULT_EXPERIENCES_DIR);
}

export async function discoverExperiences(
	rootDir: string = getExperiencesDir()
): Promise<ExperienceDiscoveryResult> {
	const entries = await safeReadDir(rootDir);

	if (!entries.ok) {
		return {
			experiences: [],
			errors: [entries.error],
			rootDir
		};
	}

	const experiences: ExperienceManifest[] = [];
	const errors: string[] = [];

	for (const entry of entries.value) {
		const distDir = join(rootDir, entry, 'dist');
		const manifestPath = join(distDir, 'experience.manifest.json');

		if (!(await isDirectory(distDir))) {
			continue;
		}

		const manifest = await readManifest(manifestPath);

		if (!manifest.ok) {
			errors.push(`${entry}: ${manifest.error}`);
			continue;
		}

		experiences.push(manifest.value);
	}

	return {
		experiences: experiences.sort((left, right) => left.title.localeCompare(right.title)),
		errors,
		rootDir
	};
}

async function safeReadDir(
	rootDir: string
): Promise<
	Readonly<{ ok: true; value: readonly string[] }> | Readonly<{ ok: false; error: string }>
> {
	try {
		return { ok: true, value: await readdir(rootDir) };
	} catch {
		return { ok: false, error: `experience root not found: ${rootDir}` };
	}
}

async function isDirectory(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

async function readManifest(
	manifestPath: string
): Promise<
	Readonly<{ ok: true; value: ExperienceManifest }> | Readonly<{ ok: false; error: string }>
> {
	try {
		const raw = await readFile(manifestPath, 'utf8');
		const parsed: unknown = JSON.parse(raw);
		return validateExperienceManifest(parsed);
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : 'could not read manifest'
		};
	}
}
