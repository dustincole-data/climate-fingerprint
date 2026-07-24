// pipeline/src/build.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_CITIES } from './cities.ts';
import { computeDomains } from '../../src/lib/geometry.ts';
import { cityStats } from '../../src/lib/poster.ts';
import type { CityPayload, CityManifestEntry } from '../../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface RawFixture {
  requested: { lat: number; lon: number };
  resolved: { lat: number; lon: number; elevation_m: number };
  timezone: string;
  window: { start: number; end: number; years: number };
  days: CityPayload['days'];
}

async function loadPayload(curated: (typeof CURATED_CITIES)[number]): Promise<CityPayload> {
  const raw: RawFixture = JSON.parse(await readFile(join(ROOT, 'pipeline', 'fixtures', curated.fixture), 'utf8'));
  return {
    meta: {
      name: curated.name, region: curated.region, country: curated.country, slug: curated.slug,
      requested: raw.requested, resolved: raw.resolved, timezone: raw.timezone, window: raw.window,
      units: { temp: 'C', precip: 'mm' },
    },
    signature: curated.signature,
    days: raw.days,
  };
}

async function main() {
  const payloads = await Promise.all(CURATED_CITIES.map(loadPayload));
  const domain = computeDomains(payloads);

  const outDir = join(ROOT, 'public', 'data');
  await mkdir(join(outDir, 'city'), { recursive: true });

  for (const payload of payloads) {
    await writeFile(join(outDir, 'city', `${payload.meta.slug}.json`), JSON.stringify(payload));
  }

  const manifest: CityManifestEntry[] = payloads.map(p => {
    const { annualMeanC, annualPrecipMm } = cityStats(p);
    const means = p.days.map(d => d.t_mean);
    const swing = Math.max(...means) - Math.min(...means);
    return {
      slug: p.meta.slug, name: p.meta.name, region: p.meta.region, country: p.meta.country,
      signature: p.signature,
      display: { lat: p.meta.resolved.lat, lon: p.meta.resolved.lon },
      summary: { annual_mean_c: annualMeanC, seasonal_swing_c: swing, annual_precip_mm: annualPrecipMm },
    };
  });
  await writeFile(join(outDir, 'cities.json'), JSON.stringify(manifest));
  await writeFile(join(outDir, 'domain.json'), JSON.stringify(domain));

  console.log(`wrote ${payloads.length} curated cities + domain to ${outDir}`);
}

main();
