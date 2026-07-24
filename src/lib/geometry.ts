import type { CityPayload, Domain } from './types';
import { cToF } from './units';

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

/** Fixed cross-city domain: temp floor/ceil over band extremes, precip max after 15-day smoothing (T04 §1).
 *  Band extremes are t_min_mean..t_max_mean — the values the day bands are actually drawn from. The interannual
 *  t_p10/t_p90 are deliberately excluded: nothing renders them, so they cannot clip the plot (T04 §1's own stated
 *  reason for the padding), yet including them stretched the domain to -41..44 against a drawn range of only
 *  -25.4..42.4. That bought two isotherm rings no city ever reaches and cost every poster ~16% of its radial
 *  amplitude. Reopen only if a later slice draws the p10-p90 interannual band. */
export function computeDomains(cities: CityPayload[]): Domain {
  let tmin = Infinity, tmax = -Infinity, pmax = 0;
  for (const city of cities) {
    for (const d of city.days) {
      tmin = Math.min(tmin, d.t_min_mean);
      tmax = Math.max(tmax, d.t_max_mean);
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

/** The isotherm rings that carry a printed value — every second one. All rings stay as quiet radial texture,
 *  but labelling all of them stacked a nine-deep ladder of overlapping boxes up the 12 o'clock spoke (18px
 *  labels in a 21px gap). Labelling every 20°C leaves ~50px of air between them. */
export function labelledIsotherms(domain: Domain): number[] {
  return isothermValues(domain).filter(t => t % 20 === 0);
}

/** The same reference grid on the imperial side — every 20°F inside the domain, returned in °F.
 *  The grid itself rides the unit toggle rather than just its labels, because reading a 10°C grid in
 *  Fahrenheit prints -4° / 32° / 68° / 104°, and a US reader (the locked default audience, T05 §11) is
 *  looking for round Fahrenheit, not converted Celsius. */
export function isothermValuesF(domain: Domain): number[] {
  const lo = cToF(domain.tmin), hi = cToF(domain.tmax);
  const values: number[] = [];
  // `|| 0` normalises the -0 that Math.ceil returns for a sub-zero start, which would print as "-0°F".
  for (let f = Math.ceil(lo / 20) * 20 || 0; f <= hi; f += 20) values.push(f);
  return values;
}
