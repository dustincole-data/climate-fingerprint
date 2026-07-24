// src/lib/render.ts
// The poster, as one pure string builder. Build-time pages (FingerprintPoster.astro) and the on-demand
// client shell must produce the SAME SVG for the same normals — a typed city is indistinguishable in
// fidelity from a curated one (T07 §1), so there is exactly one place the markup is written.
import { arc } from 'd3-shape';
import type { CityPayload, Domain } from './types';
import { N, MONTH_STARTS, MONTHS, angleForDoy, isothermValues } from './geometry';
import { rTemp, buildDayBands, buildPrecipRadii, cityStats } from './poster';
import { cToF, mmToIn } from './units';

export const W = 1000, H = 1414, CX = 500, CY = 650;
const R_OUT = 430, R_DISC = 140, R_PBASE = 160, R_MONTH = R_OUT + 46;

export interface RenderOptions {
  ground?: 'dark' | 'light';
  /** full = the portrait √2 poster; tile = square crop tight on the ring for the gallery wall. */
  mode?: 'full' | 'tile';
}

/** Escapes text/attribute content — city names reach this from a typed query, not just the curated registry. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const arcGen = arc();
function dayPath(r0: number, r1: number, a0: number, a1: number): string {
  return arcGen({ innerRadius: r0, outerRadius: r1, startAngle: a0, endAngle: a1 } as any) ?? '';
}
/** angle 0 = -y (12 o'clock), clockwise positive — matches d3-shape's arc angle convention. */
function polar(r: number, angleRad: number): [number, number] {
  return [CX + r * Math.sin(angleRad), CY - r * Math.cos(angleRad)];
}

export function renderPosterSvg(payload: CityPayload, domain: Domain, options: RenderOptions = {}): string {
  const { ground = 'dark', mode = 'full' } = options;
  const dark = ground === 'dark';
  const full = mode === 'full';
  // Unique per-instance filter IDs so multiple posters in one document (the gallery wall) don't collide on url(#glow)/url(#vig).
  const uid = payload.meta.slug;
  const viewBox = full ? `0 0 ${W} ${H}` : `${CX - 480} ${CY - 480} 960 960`;

  const bands = buildDayBands(payload, domain);
  const precipRadii = buildPrecipRadii(payload, domain);
  const { annualMeanC, annualPrecipMm } = cityStats(payload);
  const isos = isothermValues(domain);
  const dayArc = (2 * Math.PI) / N;

  let precipPath = '';
  for (let i = 0; i < N; i++) {
    const [x, y] = polar(R_PBASE + precipRadii[i], angleForDoy(i + 1));
    precipPath += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  for (let i = N - 1; i >= 0; i--) {
    const [x, y] = polar(R_PBASE, angleForDoy(i + 1));
    precipPath += 'L' + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  precipPath += 'Z';

  const parts: string[] = [];
  parts.push(`<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img"`
    + ` aria-label="${esc(payload.meta.name)} climate fingerprint" data-ground="${ground}">`);

  parts.push('<defs>');
  parts.push(`<filter id="glow-${uid}" x="-25%" y="-25%" width="150%" height="150%">`
    + `<feGaussianBlur stdDeviation="${dark ? 6 : 0}" result="b"></feGaussianBlur>`
    + `<feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>`);
  parts.push(`<radialGradient id="vig-${uid}" cx="50%" cy="45%" r="62%">`
    + `<stop offset="60%" stop-color="#000" stop-opacity="0"></stop>`
    + `<stop offset="100%" stop-color="#000" stop-opacity="${dark ? 0.34 : 0.05}"></stop></radialGradient>`);
  parts.push('</defs>');

  parts.push(`<rect width="${W}" height="${H}" fill="var(--bg)"></rect>`);

  for (const t of isos) {
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${rTemp(t, domain).toFixed(1)}" fill="none" stroke="var(--iso)" stroke-width="1"></circle>`);
  }

  if (full) {
    MONTH_STARTS.forEach((start, m) => {
      const [x0, y0] = polar(R_OUT + 4, angleForDoy(start));
      const [x1, y1] = polar(R_OUT + 12, angleForDoy(start));
      const [lx, ly] = polar(R_MONTH, angleForDoy(start + 15));
      parts.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--hair)" stroke-width="1.2"></line>`);
      parts.push(`<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" font-size="15" letter-spacing="1">${MONTHS[m]}</text>`);
    });
  }

  parts.push(`<path d="${precipPath}" fill="var(--precip)" fill-opacity="${dark ? 0.5 : 0.55}"></path>`);

  parts.push(`<g transform="translate(${CX}, ${CY})" filter="url(#glow-${uid})"`
    + ` stroke="${dark ? 'none' : 'rgba(30,25,20,0.16)'}" stroke-width="${dark ? 0 : 0.5}">`);
  bands.forEach((b, i) => {
    const a0 = angleForDoy(i + 1) - dayArc * 0.6;
    const a1 = angleForDoy(i + 1) + dayArc * 0.6;
    parts.push(`<path d="${dayPath(b.r0, b.r1, a0, a1)}" fill="${b.fill}"></path>`);
  });
  parts.push('</g>');

  if (full) {
    for (const t of isos) {
      const cy = CY - rTemp(t, domain);
      parts.push(`<rect x="${CX - 20}" y="${cy - 9}" width="40" height="18" rx="3" fill="var(--bg)" fill-opacity="0.82"></rect>`);
      parts.push(`<text x="${CX}" y="${cy - 1}" text-anchor="middle" fill="var(--ink)" font-family="var(--sans)" font-size="10.5">${Math.round(cToF(t))}°F</text>`);
      parts.push(`<text x="${CX}" y="${cy + 8}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" font-size="8">${t}°C</text>`);
    }

    const tempFPrimary = Math.round(cToF(annualMeanC));
    const tempCSecondary = Math.round(annualMeanC);
    const precipInPrimary = mmToIn(annualPrecipMm).toFixed(1);
    const precipMmSecondary = Math.round(annualPrecipMm);
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DISC}" fill="var(--bg)"></circle>`);
    parts.push(`<text x="${CX}" y="${CY - 12}" text-anchor="middle" fill="var(--ink)" font-family="var(--serif)" font-size="58" font-weight="500">${esc(payload.meta.name)}</text>`);
    parts.push(`<text x="${CX}" y="${CY + 16}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" font-size="14.5" letter-spacing="3" font-weight="600">${esc(payload.meta.country.toUpperCase())}</text>`);
    parts.push(`<text x="${CX}" y="${CY + 50}" text-anchor="middle" fill="var(--ink)" font-family="var(--sans)" font-size="15.5">${esc(payload.signature)}</text>`);
    parts.push(`<text x="${CX}" y="${CY + 80}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" font-size="13.5">${tempFPrimary}°F / ${tempCSecondary}°C avg · ${precipInPrimary} in / ${precipMmSecondary} mm/yr</text>`);
  }

  parts.push(`<rect width="${W}" height="${H}" fill="url(#vig-${uid})" pointer-events="none"></rect>`);
  parts.push('</svg>');
  return parts.join('');
}
