import { describe, it, expect } from 'vitest';
import { angleForDoy, smooth, computeDomains, isothermValues, labelledIsotherms, isothermValuesF, N } from './geometry';
import type { CityPayload } from './types';

describe('angleForDoy', () => {
  it("places day 1 at angle 0 (12 o'clock)", () => { expect(angleForDoy(1)).toBe(0); });
  it('matches the raw fraction-of-year formula for day 91', () => {
    expect(angleForDoy(91)).toBeCloseTo((90 / N) * 2 * Math.PI, 10);
  });
});

describe('smooth', () => {
  it('averages a single spike across the centered 15-day wraparound window', () => {
    const arr = new Array(365).fill(0); arr[0] = 15;
    const out = smooth(arr, 15);
    expect(out[0]).toBeCloseTo(1, 10);
    expect(out[7]).toBeCloseTo(1, 10);
    expect(out[8]).toBeCloseTo(0, 10);
  });
});

function makeCity(overrides: Partial<CityPayload['days'][number]>): CityPayload {
  return {
    meta: { name: 't', region: '', country: '', slug: 't', requested: { lat: 0, lon: 0 }, resolved: { lat: 0, lon: 0, elevation_m: 0 }, timezone: 'UTC', window: { start: 1991, end: 2020, years: 30 }, units: { temp: 'C', precip: 'mm' } },
    signature: '',
    days: Array.from({ length: 365 }, (_, i) => ({ doy: i + 1, md: '', n: 30, t_mean: 0, t_max_mean: 0, t_min_mean: 0, t_p10: 0, t_p90: 0, precip_mean: 0, precip_p90: 0, ...overrides })),
  };
}

describe('computeDomains', () => {
  it('takes the floor/ceil of band extremes across all cities, and the smoothed precip max', () => {
    const cityA = makeCity({ t_min_mean: -5, t_p10: -8, t_max_mean: 10, t_p90: 12, precip_mean: 5 });
    const cityB = makeCity({ t_min_mean: 2, t_p10: -1, t_max_mean: 30, t_p90: 32, precip_mean: 8 });
    expect(computeDomains([cityA, cityB])).toEqual({ tmin: -6, tmax: 31, pmax: 8 });
  });

  it('ignores the interannual p10/p90, which nothing draws', () => {
    const wide = makeCity({ t_min_mean: -5, t_p10: -40, t_max_mean: 10, t_p90: 45, precip_mean: 1 });
    expect(computeDomains([wide])).toMatchObject({ tmin: -6, tmax: 11 });
  });
});

describe('isothermValues', () => {
  it('steps by 10°C starting at the first multiple of 10 at or above tmin', () => {
    expect(isothermValues({ tmin: -9, tmax: 33, pmax: 0 })).toEqual([0, 10, 20, 30]);
  });
});

describe('labelledIsotherms', () => {
  it('labels every second ring so the label column is not a stacked ladder', () => {
    expect(labelledIsotherms({ tmin: -27, tmax: 44, pmax: 0 })).toEqual([-20, 0, 20, 40]);
  });
});

describe('isothermValuesF', () => {
  it('steps by 20°F inside the domain, so imperial labels are round Fahrenheit', () => {
    expect(isothermValuesF({ tmin: -27, tmax: 44, pmax: 0 })).toEqual([0, 20, 40, 60, 80, 100]);
  });
});
