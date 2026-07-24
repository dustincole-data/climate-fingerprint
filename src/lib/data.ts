// src/lib/data.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CityPayload, CityManifestEntry, Domain } from './types';

// process.cwd()-based (not import.meta.url) — matches Namesake's data.ts note: the bundler
// collapses nested pages (pages/city/[slug].astro) to a different output depth than a relative walk-up assumes.
const DATA = join(process.cwd(), 'public', 'data');

export async function readCitiesManifest(): Promise<CityManifestEntry[]> {
  return JSON.parse(await readFile(join(DATA, 'cities.json'), 'utf8'));
}
export async function readCityPayload(slug: string): Promise<CityPayload> {
  return JSON.parse(await readFile(join(DATA, 'city', `${slug}.json`), 'utf8'));
}
export async function readDomain(): Promise<Domain> {
  return JSON.parse(await readFile(join(DATA, 'domain.json'), 'utf8'));
}
