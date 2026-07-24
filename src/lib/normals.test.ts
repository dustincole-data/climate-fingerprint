import { describe, it, expect } from 'vitest';
import { computeDays, yearsCovered, hasGaps, type OpenMeteoDaily } from './normals';

/** Two years of daily rows (1991 leap-free, 1992 with 02-29), constant per year so the normals are predictable. */
function daily(years: { year: number; t: number; p: number }[]): OpenMeteoDaily {
  const time: string[] = [], tmean: number[] = [], tmax: number[] = [], tmin: number[] = [], precip: number[] = [];
  for (const { year, t, p } of years) {
    const leap = year % 4 === 0;
    const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 0; m < 12; m++) {
      for (let d = 1; d <= monthDays[m]; d++) {
        time.push(`${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
        tmean.push(t); tmax.push(t + 5); tmin.push(t - 5); precip.push(p);
      }
    }
  }
  return { time, temperature_2m_mean: tmean, temperature_2m_max: tmax, temperature_2m_min: tmin, precipitation_sum: precip };
}

describe('computeDays', () => {
  const days = computeDays(daily([{ year: 1991, t: 10, p: 2 }, { year: 1992, t: 20, p: 4 }]));

  it('drops the leap day and returns exactly 365 day-of-year rows', () => {
    expect(days).toHaveLength(365);
    expect(days.some(d => d.md === '02-29')).toBe(false);
  });
  it('averages each day-of-year across the years present', () => {
    expect(days[0]).toMatchObject({ doy: 1, md: '01-01', n: 2, t_mean: 15, t_max_mean: 20, t_min_mean: 10, precip_mean: 3 });
  });
  it('spreads the interannual percentiles across the two years', () => {
    expect(days[0].t_p10).toBeCloseTo(11, 5);
    expect(days[0].t_p90).toBeCloseTo(19, 5);
  });

  it('averages only the years that have a value, never fabricating the missing one', () => {
    const d = daily([{ year: 1991, t: 10, p: 2 }, { year: 1992, t: 20, p: 4 }]);
    d.temperature_2m_mean[0] = null;   // 1991-01-01 missing
    const out = computeDays(d);
    expect(out[0].n).toBe(1);
    expect(out[0].t_mean).toBe(20);
  });
});

describe('yearsCovered', () => {
  it('reports the typical sample depth, not the thinnest single day', () => {
    const d = daily([{ year: 1991, t: 10, p: 2 }, { year: 1992, t: 20, p: 4 }]);
    d.temperature_2m_mean[5] = null;
    expect(yearsCovered(computeDays(d))).toBe(2);
  });
});

describe('hasGaps', () => {
  it('is false for a complete record and true when a day-of-year has no reading at all', () => {
    const full = daily([{ year: 1991, t: 10, p: 2 }]);
    expect(hasGaps(computeDays(full))).toBe(false);
    const holed = daily([{ year: 1991, t: 10, p: 2 }]);
    holed.temperature_2m_mean[0] = null;
    expect(hasGaps(computeDays(holed))).toBe(true);
  });
});
