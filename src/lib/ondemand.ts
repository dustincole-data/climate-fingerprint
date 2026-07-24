// src/lib/ondemand.ts
// The long-tail path (T07 §3): geocode -> archive -> normals, entirely in the visitor's browser. No server,
// no key, no cron. Each visitor's browser is its own IP, so a spike never concentrates into one shared 429.
import type { CityPayload } from './types';
import { computeDays, yearsCovered, hasGaps, WINDOW } from './normals';
import { deslugify } from './slug';

const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const DAILY = 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum';
/** Bumped only if the payload shape changes — 1991-2020 normals themselves never do, so there is no TTL. */
const CACHE_PREFIX = 'cf:city:1:';
/** Below this, the record is too thin to call a typical year — falls through to not-found (T07 §5). */
const MIN_YEARS = 3;

export type TypedCity =
  | { status: 'ok'; payload: CityPayload; years: number }
  | { status: 'not-found'; query: string }
  | { status: 'offline' }
  | { status: 'error' };

interface GeoHit {
  name: string; latitude: number; longitude: number;
  timezone?: string; country?: string; admin1?: string;
}

function isPayload(value: unknown): value is CityPayload {
  const p = value as CityPayload;
  return !!p && Array.isArray(p.days) && p.days.length === 365 && !!p.meta?.name;
}

/** localStorage, no TTL — doubles as offline revisit. A full or blocked store is never fatal. */
function readCache(slug: string): CityPayload | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(slug: string, payload: CityPayload): void {
  try {
    localStorage.setItem(CACHE_PREFIX + slug, JSON.stringify(payload));
  } catch { /* quota or private mode: the city still renders, it just won't be remembered */ }
}

/** Top-population match, no picker (T07 §5) — the resolved label is what tells the visitor what they got. */
async function geocode(query: string): Promise<GeoHit | null> {
  const res = await fetch(`${GEOCODE}?name=${encodeURIComponent(query)}&count=1`);
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const json = await res.json();
  return json?.results?.[0] ?? null;
}

/** Same window, same statistics as the build pipeline, so a typed city is indistinguishable in fidelity. */
async function fetchNormals(slug: string, hit: GeoHit): Promise<CityPayload | null> {
  const url = `${ARCHIVE}?latitude=${hit.latitude}&longitude=${hit.longitude}`
    + `&start_date=${WINDOW.start}-01-01&end_date=${WINDOW.end}-12-31`
    + `&daily=${DAILY}&timezone=${encodeURIComponent(hit.timezone || 'auto')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`archive HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.daily?.time?.length) return null;

  const days = computeDays(json.daily);
  // A hole in the day-of-year coverage would have to be drawn as an invented value, and T07 §5 forbids that.
  if (hasGaps(days) || yearsCovered(days) < MIN_YEARS) return null;

  return {
    meta: {
      name: hit.name,
      region: hit.admin1 ?? '',
      country: hit.country ?? '',
      slug,
      requested: { lat: hit.latitude, lon: hit.longitude },
      resolved: { lat: json.latitude, lon: json.longitude, elevation_m: json.elevation },
      timezone: json.timezone,
      window: { ...WINDOW },
      units: { temp: 'C', precip: 'mm' },
    },
    // The curated set's hand-written "feeling" line has no equivalent here, so the identity disc shows
    // the resolved region instead of an empty slot.
    signature: hit.admin1 ?? '',
    days,
  };
}

/** Resolve a non-curated `/city/<slug>` entirely client-side. Cache first, so a revisit is instant and offline-safe. */
export async function loadTypedCity(slug: string): Promise<TypedCity> {
  const cached = readCache(slug);
  if (cached) return { status: 'ok', payload: cached, years: yearsCovered(cached.days) };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { status: 'offline' };

  const query = deslugify(slug);
  try {
    const hit = await geocode(query);
    if (!hit) return { status: 'not-found', query };

    const payload = await fetchNormals(slug, hit);
    if (!payload) return { status: 'not-found', query };

    writeCache(slug, payload);
    return { status: 'ok', payload, years: yearsCovered(payload.days) };
  } catch {
    return { status: 'error' };
  }
}
