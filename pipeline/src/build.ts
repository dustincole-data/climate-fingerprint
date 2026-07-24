// pipeline/src/build.ts
// `npm run data` — build the curated 30's normals into public/data/*.json (gitignored, CI-generated).
// Every curated city reads its committed fixture in pipeline/fixtures/; a city with no fixture yet is fetched
// once from Open-Meteo's ERA5 archive (free, no key, browserless) and FROZEN there for commit. CI never fetches:
// a cold build can't finish 26 weight-heavy 30-yr calls inside Open-Meteo's hourly cap, and 1991-2020 normals
// never change, so refetching them per deploy was pure risk. All 30 then share one globally-fixed temp/precip
// domain (T04 §1) so tiles are comparable across the gallery wall.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURATED_CITIES, type CuratedCity } from './cities.ts';
import { computeDomains } from '../../src/lib/geometry.ts';
import { cityStats } from '../../src/lib/poster.ts';
import type { CityPayload, CityDay, CityManifestEntry } from '../../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_DIR = join(ROOT, 'pipeline', 'fixtures');          // committed per-city normals — the only input CI reads
const CACHE_DIR = join(ROOT, 'pipeline', '.cache', 'archive');   // raw responses cached (gitignored) so re-runs don't refetch
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const SPACING_MS = 20_000;   // T02: a 30-yr call is weight-heavy — space live calls ~20s apart
const BACKOFF_MS = 65_000;   // T02: retry HTTP 429 after ~65s, escalating per attempt
const MAX_ATTEMPTS = 6;      // a spent hourly/daily quota never clears inside one run — fail loud, don't hang CI
const WINDOW = { start: 1991, end: 2020, years: 30 } as const;

// Non-leap 365-day frame (02-29 dropped, per T02); doy 1..365 in calendar order.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const CALENDAR: { doy: number; md: string }[] = (() => {
  const out: { doy: number; md: string }[] = [];
  let doy = 1;
  for (let m = 0; m < 12; m++)
    for (let d = 1; d <= MONTH_DAYS[m]; d++)
      out.push({ doy: doy++, md: `${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  return out;
})();

interface RawFixture {
  requested: { lat: number; lon: number };
  resolved: { lat: number; lon: number; elevation_m: number };
  timezone: string;
  window: { start: number; end: number; years: number };
  source?: string;
  days: CityDay[];
}

const SOURCE = 'Open-Meteo Historical Weather API (ERA5), archive-api.open-meteo.com, free/no-key';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const round1 = (x: number) => Math.round(x * 10) / 10;              // temps → 0.1 °C (matches fixtures)
const round2 = (x: number) => Math.round(x * 100) / 100;           // precip → 0.01 mm (matches fixtures; keeps dry-city trace honest)
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
/** Type-7 (linear-interpolation) percentile of a pre-sorted ascending array. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

interface OpenMeteoDaily {
  time: string[];
  temperature_2m_mean: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
}

/** Day-of-year normals from ~11k daily rows: per-md mean of mean/max/min + interannual p10/p90; precip mean + p90.
 *  Missing values are averaged over the years that have them (never fabricated); `n` records the sample count. */
function computeDays(daily: OpenMeteoDaily): CityDay[] {
  const buckets = new Map<string, { tmean: number[]; tmax: number[]; tmin: number[]; p: number[] }>();
  for (let i = 0; i < daily.time.length; i++) {
    const md = daily.time[i].slice(5);
    if (md === '02-29') continue;
    let b = buckets.get(md);
    if (!b) { b = { tmean: [], tmax: [], tmin: [], p: [] }; buckets.set(md, b); }
    const tm = daily.temperature_2m_mean[i], tx = daily.temperature_2m_max[i], tn = daily.temperature_2m_min[i], pr = daily.precipitation_sum[i];
    if (tm != null) b.tmean.push(tm);
    if (tx != null) b.tmax.push(tx);
    if (tn != null) b.tmin.push(tn);
    if (pr != null) b.p.push(pr);
  }
  return CALENDAR.map(({ doy, md }) => {
    const b = buckets.get(md)!;
    const sortedT = [...b.tmean].sort((x, y) => x - y);
    const sortedP = [...b.p].sort((x, y) => x - y);
    return {
      doy, md, n: b.tmean.length,
      t_mean: round1(mean(b.tmean)),
      t_max_mean: round1(mean(b.tmax)),
      t_min_mean: round1(mean(b.tmin)),
      t_p10: round1(percentile(sortedT, 0.10)),
      t_p90: round1(percentile(sortedT, 0.90)),
      precip_mean: round2(mean(b.p)),
      precip_p90: round2(percentile(sortedP, 0.90)),
    };
  });
}

interface ArchiveResponse {
  latitude: number; longitude: number; elevation: number; timezone: string;
  daily: OpenMeteoDaily;
}

/** Guards both the live and cached paths: a truncated response (or a half-written cache file) must fail loud,
 *  not silently average into NaN normals. 1991-2020 = 10958 days including leap days. */
function assertComplete(slug: string, json: unknown): asserts json is ArchiveResponse {
  const days = (json as ArchiveResponse)?.daily?.time?.length;
  if (!days || days < 10000) throw new Error(`${slug}: short archive response (${days} days) — expected ~10958`);
}

let liveFetches = 0;
/** Fetch a city's raw 1991-2020 archive response, disk-cached. Spaces live calls ~20s apart and backs off on 429.
 *  Both paths return the SAME raw response shape — the cache stores exactly what the API returned. */
async function fetchArchive(c: CuratedCity): Promise<ArchiveResponse> {
  const cacheFile = join(CACHE_DIR, `${c.slug}.json`);
  let cached: unknown;
  try {
    cached = JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch { /* cache miss → fetch */ }
  if (cached !== undefined) {
    assertComplete(c.slug, cached);
    console.log(`  cache hit  ${c.slug}`);
    return cached;
  }

  const { lat, lon, tz } = c.pin!;
  const url = `${ARCHIVE}?latitude=${lat}&longitude=${lon}&start_date=1991-01-01&end_date=2020-12-31`
    + `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum`
    + `&timezone=${encodeURIComponent(tz)}`;

  if (liveFetches > 0) { console.log(`  spacing ${SPACING_MS / 1000}s…`); await sleep(SPACING_MS); }
  liveFetches++;

  for (let attempt = 1; ; attempt++) {
    console.log(`  fetch      ${c.slug} (attempt ${attempt})`);
    const res = await fetch(url);
    if (res.status === 429) {
      if (attempt >= MAX_ATTEMPTS)
        throw new Error(`${c.slug}: still HTTP 429 after ${MAX_ATTEMPTS} attempts — Open-Meteo's rolling quota is spent. `
          + `Wait for it to reset, then re-run \`npm run data\`: every city already in pipeline/.cache/archive/ is reused, so only the missing ones refetch.`);
      const wait = BACKOFF_MS * attempt;   // 65s, 130s, 195s… a spent quota needs more than a flat retry
      console.log(`  429 → backoff ${wait / 1000}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${c.slug}: HTTP ${res.status} — ${await res.text()}`);
    const json = await res.json();
    assertComplete(c.slug, json);
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, JSON.stringify(json));
    return json;
  }
}

/** A curated city's raw normals: its committed fixture, else a one-time fetch that is frozen into one.
 *  A malformed fixture throws (never silently refetches) — the slice-3 lesson: both paths, one shape. */
async function rawForCity(c: CuratedCity): Promise<RawFixture> {
  const file = join(FIXTURE_DIR, `${c.slug}.json`);
  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  if (text !== null) return JSON.parse(text);

  if (process.env.CI) throw new Error(`${c.slug}: no committed fixture at pipeline/fixtures/${c.slug}.json. `
    + `CI never fetches Open-Meteo (its hourly cap can't serve a cold 26-city build) — run \`npm run data\` locally and commit the frozen fixture.`);
  if (!c.pin) throw new Error(`${c.slug}: no fixture and no pin — add a pin { lat, lon, tz } to pipeline/src/cities.ts to fetch it.`);

  const j = await fetchArchive(c);
  const raw: RawFixture = {
    requested: { lat: c.pin.lat, lon: c.pin.lon },
    resolved: { lat: j.latitude, lon: j.longitude, elevation_m: j.elevation },
    timezone: j.timezone,
    window: { ...WINDOW },
    source: SOURCE,
    days: computeDays(j.daily),
  };
  await writeFile(file, JSON.stringify(raw));
  console.log(`  froze      pipeline/fixtures/${c.slug}.json  (commit it — CI reads only fixtures)`);
  return raw;
}

function toPayload(c: CuratedCity, raw: RawFixture): CityPayload {
  return {
    meta: {
      name: c.name, region: c.region, country: c.country, slug: c.slug,
      requested: raw.requested, resolved: raw.resolved, timezone: raw.timezone, window: raw.window,
      units: { temp: 'C', precip: 'mm' },
    },
    signature: c.signature,
    days: raw.days,
  };
}

async function main() {
  // Sequential (not Promise.all): fixture loads are instant; fetches must serialize so the 20s spacing actually holds.
  const payloads: CityPayload[] = [];
  for (const c of CURATED_CITIES) payloads.push(toPayload(c, await rawForCity(c)));

  const domain = computeDomains(payloads);   // globally-fixed temp/precip domain across all 30

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
      summary: { annual_mean_c: round1(annualMeanC), seasonal_swing_c: round1(swing), annual_precip_mm: Math.round(annualPrecipMm) },
    };
  });
  await writeFile(join(outDir, 'cities.json'), JSON.stringify(manifest));
  await writeFile(join(outDir, 'domain.json'), JSON.stringify(domain));

  console.log(`wrote ${payloads.length} curated cities + domain to ${outDir}`);
  console.log(`domain: tmin=${domain.tmin} tmax=${domain.tmax} pmax=${round2(domain.pmax)}`);
}

main();
