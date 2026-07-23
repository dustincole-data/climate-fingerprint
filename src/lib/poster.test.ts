import { describe, it, expect } from 'vitest';
import { rTemp, buildDayBands, buildPrecipRadii, cityStats } from './poster';
import type { CityPayload, Domain } from './types';

function makeCity(overrides: Partial<CityPayload['days'][number]> = {}): CityPayload {
  return {
    meta: { name: 'Test', region: '', country: 'Testland', slug: 'test', requested: { lat: 0, lon: 0 }, resolved: { lat: 0, lon: 0, elevation_m: 0 }, timezone: 'UTC', window: { start: 1991, end: 2020, years: 30 }, units: { temp: 'C', precip: 'mm' } },
    signature: 'test city',
    days: Array.from({ length: 365 }, (_, i) => ({ doy: i + 1, md: '', n: 30, t_mean: 10, t_max_mean: 15, t_min_mean: 5, t_p10: 5, t_p90: 15, precip_mean: 4, precip_p90: 8, ...overrides })),
  };
}
const domain: Domain = { tmin: 4, tmax: 16, pmax: 4 };

describe('rTemp', () => {
  it('maps the domain midpoint to the annulus midpoint', () => { expect(rTemp(10, domain)).toBeCloseTo(340, 5); });
  it('clamps below tmin to R_IN (250)', () => { expect(rTemp(-100, domain)).toBe(250); });
  it('clamps above tmax to R_OUT (430)', () => { expect(rTemp(100, domain)).toBe(430); });
});

describe('buildDayBands', () => {
  it("returns 365 bands with the fixture's constant color and a >=6px band", () => {
    const bands = buildDayBands(makeCity(), domain);
    expect(bands).toHaveLength(365);
    expect(bands[0].r1 - bands[0].r0).toBeGreaterThanOrEqual(6);
    expect(new Set(bands.map(b => b.fill)).size).toBe(1);
  });
});

describe('buildPrecipRadii', () => {
  it('maps a uniform precip day to the full sqrt-compressed height (p===pmax)', () => {
    const radii = buildPrecipRadii(makeCity(), domain);
    expect(radii).toHaveLength(365);
    radii.forEach(r => expect(r).toBeCloseTo(56, 5));
  });
});

describe('cityStats', () => {
  it('averages t_mean and sums precip_mean across the year', () => {
    const { annualMeanC, annualPrecipMm } = cityStats(makeCity());
    expect(annualMeanC).toBeCloseTo(10, 10);
    expect(annualPrecipMm).toBeCloseTo(4 * 365, 6);
  });
});
