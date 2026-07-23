import type { CityPayload, Domain } from './types';

export const N = 365;
export const MONTH_STARTS = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
export const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Radians, 0 at doy=1 (12 o'clock / -y), increasing clockwise — matches d3-shape's arc angle convention. */
export function angleForDoy(doy: number): number {
  return (doy - 1) / N * 2 * Math.PI;
}

/** Centered moving average over a cyclic (day-of-year) array, wrapping at both ends. */
export function smooth(values: number[], win = 15): number[] {
  const half = (win - 1) / 2;
  const n = values.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -half; k <= half; k++) sum += values[(i + k + n) % n];
    out[i] = sum / win;
  }
  return out;
}

/** Fixed cross-city domain: temp floor/ceil over band extremes, precip max after 15-day smoothing (T04 §1). */
export function computeDomains(cities: CityPayload[]): Domain {
  let tmin = Infinity, tmax = -Infinity, pmax = 0;
  for (const city of cities) {
    for (const d of city.days) {
      tmin = Math.min(tmin, d.t_min_mean, d.t_p10);
      tmax = Math.max(tmax, d.t_max_mean, d.t_p90);
    }
    const smoothed = smooth(city.days.map(d => d.precip_mean));
    pmax = Math.max(pmax, ...smoothed);
  }
  return { tmin: Math.floor(tmin) - 1, tmax: Math.ceil(tmax) + 1, pmax };
}

/** 10°C-step isotherm values spanning the domain (e.g. tmin=-9 -> starts at 0). */
export function isothermValues(domain: Domain): number[] {
  const start = Math.ceil(domain.tmin / 10) * 10 || 0;
  const values: number[] = [];
  for (let t = start; t <= domain.tmax; t += 10) values.push(t);
  return values;
}
