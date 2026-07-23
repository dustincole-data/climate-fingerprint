export interface RampStop { t: number; L: number; C: number; H: number; }

/** Diverging cool<->warm ramp, 7 stops, pale-neutral pivot at 13°C (T04 §2). */
export const RAMP: RampStop[] = [
  { t: -12, L: 0.52, C: 0.13, H: 270 },
  { t: -3, L: 0.60, C: 0.14, H: 245 },
  { t: 6, L: 0.72, C: 0.115, H: 215 },
  { t: 13, L: 0.86, C: 0.045, H: 150 },
  { t: 19, L: 0.83, C: 0.115, H: 80 },
  { t: 26, L: 0.70, C: 0.165, H: 48 },
  { t: 34, L: 0.60, C: 0.185, H: 28 },
];

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/** Interpolates the ramp linearly in OKLCH; clamps input to [-12, 34]°C. */
export function tempColor(tRaw: number): string {
  const t = Math.max(RAMP[0].t, Math.min(RAMP[RAMP.length - 1].t, tRaw));
  for (let i = 0; i < RAMP.length - 1; i++) {
    const a = RAMP[i], b = RAMP[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      const L = (lerp(a.L, b.L, f) * 100).toFixed(1);
      const C = lerp(a.C, b.C, f).toFixed(4);
      const H = lerp(a.H, b.H, f).toFixed(1);
      return `oklch(${L}% ${C} ${H})`;
    }
  }
  const last = RAMP[RAMP.length - 1];
  return `oklch(${(last.L * 100).toFixed(1)}% ${last.C.toFixed(4)} ${last.H.toFixed(1)})`;
}
