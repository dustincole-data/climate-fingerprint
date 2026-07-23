import type { CityPayload, Domain } from './types';
import { tempColor } from './color';
import { smooth } from './geometry';

const R_IN = 250, R_OUT = 430, P_MAXH = 56, MIN_BAND = 6;

/** Maps a temperature to its radius on the fixed cross-city domain, clamped to the annulus (T04 §1). */
export function rTemp(t: number, domain: Domain): number {
  const f = (t - domain.tmin) / (domain.tmax - domain.tmin);
  return Math.max(R_IN, Math.min(R_OUT, R_IN + (R_OUT - R_IN) * f));
}

export interface DayBand { r0: number; r1: number; fill: string; }

/** Per-day radius band (diurnal low->high, min 6px thick) + fill color (typical daily mean). */
export function buildDayBands(payload: CityPayload, domain: Domain): DayBand[] {
  return payload.days.map(d => {
    const r0 = rTemp(d.t_min_mean, domain);
    let r1 = rTemp(d.t_max_mean, domain);
    if (r1 - r0 < MIN_BAND) r1 = r0 + MIN_BAND;
    return { r0, r1, fill: tempColor(d.t_mean) };
  });
}

/** Precip ring height above R_PBASE per day: sqrt-compressed, 15-day smoothed (T04 §1). */
export function buildPrecipRadii(payload: CityPayload, domain: Domain): number[] {
  const smoothed = smooth(payload.days.map(d => d.precip_mean));
  return smoothed.map(p => P_MAXH * Math.sqrt(Math.max(0, p) / domain.pmax));
}

/** Annual mean temp (°C) and total annual precip (mm) from the day-of-year normals. */
export function cityStats(payload: CityPayload): { annualMeanC: number; annualPrecipMm: number } {
  const n = payload.days.length;
  const annualMeanC = payload.days.reduce((s, d) => s + d.t_mean, 0) / n;
  const annualPrecipMm = payload.days.reduce((s, d) => s + d.precip_mean, 0);
  return { annualMeanC, annualPrecipMm };
}
