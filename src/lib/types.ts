/** One day-of-year row of 1991-2020 climate normals (T02 model; leap day dropped, 365 rows). */
export interface CityDay {
  doy: number; md: string; n: number;
  t_mean: number; t_max_mean: number; t_min_mean: number;
  t_p10: number; t_p90: number;
  precip_mean: number; precip_p90: number;
}

export interface CityMeta {
  name: string; region: string; country: string; slug: string;
  requested: { lat: number; lon: number };
  resolved: { lat: number; lon: number; elevation_m: number };
  timezone: string;
  window: { start: number; end: number; years: number };
  units: { temp: 'C'; precip: 'mm' };
}

export interface CityPayload {
  meta: CityMeta;
  signature: string;   // curated "feeling" line, e.g. "mile-high, big daily swing, dry" (T06)
  days: CityDay[];
}

/** Fixed cross-city scale, baked at build from the curated set (T04 §1). */
export interface Domain { tmin: number; tmax: number; pmax: number; }

/** Lightweight gallery-wall row — no day-of-year data (T07 §4 manifest shape). `signature` carries the T06 "feeling" phrase for tile hover. */
export interface CityManifestEntry {
  slug: string; name: string; region: string; country: string;
  signature: string;
  display: { lat: number; lon: number };
  summary: { annual_mean_c: number; seasonal_swing_c: number; annual_precip_mm: number };
}
