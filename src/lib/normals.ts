// src/lib/normals.ts
// Day-of-year normals from raw Open-Meteo daily rows (T02 model). Lives in src/lib so the build pipeline
// and the on-demand browser path compute a typed city the SAME way a curated one was computed (T07 §1).
import type { CityDay } from './types';

export const WINDOW = { start: 1991, end: 2020, years: 30 } as const;

// Non-leap 365-day frame (02-29 dropped, per T02); doy 1..365 in calendar order.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const CALENDAR: { doy: number; md: string }[] = (() => {
  const out: { doy: number; md: string }[] = [];
  let doy = 1;
  for (let m = 0; m < 12; m++)
    for (let d = 1; d <= MONTH_DAYS[m]; d++)
      out.push({ doy: doy++, md: `${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  return out;
})();

export const round1 = (x: number) => Math.round(x * 10) / 10;    // temps → 0.1 °C (matches fixtures)
export const round2 = (x: number) => Math.round(x * 100) / 100;  // precip → 0.01 mm (matches fixtures; keeps dry-city trace honest)
const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

/** Type-7 (linear-interpolation) percentile of a pre-sorted ascending array. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export interface OpenMeteoDaily {
  time: string[];
  temperature_2m_mean: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
}

/** Day-of-year normals from ~11k daily rows: per-md mean of mean/max/min + interannual p10/p90; precip mean + p90.
 *  Missing values are averaged over the years that have them (never fabricated); `n` records the sample count.
 *  A day-of-year with no usable reading at all yields zeros with `n: 0` — callers check coverage, see yearsCovered. */
export function computeDays(daily: OpenMeteoDaily): CityDay[] {
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
    const b = buckets.get(md) ?? { tmean: [], tmax: [], tmin: [], p: [] };
    const sortedT = [...b.tmean].sort((x, y) => x - y);
    const sortedP = [...b.p].sort((x, y) => x - y);
    const avg = (a: number[]) => (a.length ? round1(mean(a)) : 0);
    return {
      doy, md, n: b.tmean.length,
      t_mean: avg(b.tmean),
      t_max_mean: avg(b.tmax),
      t_min_mean: avg(b.tmin),
      t_p10: b.tmean.length ? round1(percentile(sortedT, 0.10)) : 0,
      t_p90: b.tmean.length ? round1(percentile(sortedT, 0.90)) : 0,
      precip_mean: b.p.length ? round2(mean(b.p)) : 0,
      precip_p90: b.p.length ? round2(percentile(sortedP, 0.90)) : 0,
    };
  });
}

/** Typical years of record behind a day — what the "based on about X years" note reports (T07 §5).
 *  Median, not min: one thin day shouldn't misreport a city with an otherwise full window. */
export function yearsCovered(days: CityDay[]): number {
  const ns = days.map(d => d.n).sort((a, b) => a - b);
  return ns[Math.floor(ns.length / 2)];
}

/** True if some day-of-year has no reading at all. Those days would have to be drawn as invented values,
 *  and T07 §5 forbids fabricating missing data — so such a city falls through to the not-found state. */
export function hasGaps(days: CityDay[]): boolean {
  return days.some(d => d.n === 0);
}
