// src/lib/render.ts
// The poster, as one pure string builder. Build-time pages (FingerprintPoster.astro) and the on-demand
// client shell must produce the SAME SVG for the same normals — a typed city is indistinguishable in
// fidelity from a curated one (T07 §1), so there is exactly one place the markup is written.
//
// The SVG is ground- and unit-AGNOSTIC (slice 5): both grounds resolve through CSS custom properties and
// both unit systems are emitted, with the toggle choosing which is painted. That is what lets one click
// restyle the detail poster and all 30 wall tiles at once, with no re-render and no data refetch.
// Slice 7 (export) must resolve the live computed values when it serializes, since var() and the CSS
// overrides below do not survive into resvg or a canvas rasterization of a detached SVG.
import { arc } from 'd3-shape';
import type { CityPayload, Domain } from './types';
import { N, MONTH_STARTS, MONTHS, angleForDoy, isothermValues, labelledIsotherms, isothermValuesF } from './geometry';
import { rTemp, buildDayBands, buildPrecipRadii, cityStats } from './poster';
import { cToF, fToC, mmToIn } from './units';

export const W = 1000, H = 1414, CX = 500, CY = 650;
const R_OUT = 430, R_DISC = 140, R_PBASE = 160, R_MONTH = R_OUT + 46;
/** Fully-open bloom mask radius — past R_OUT + the month ring so nothing is ever clipped at rest. */
const R_BLOOM = 520;

export interface RenderOptions {
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
  const { mode = 'full' } = options;
  const full = mode === 'full';
  // Unique per-instance ids so multiple posters in one document (the gallery wall) don't collide on url(#…).
  const uid = payload.meta.slug;
  const viewBox = full ? `0 0 ${W} ${H}` : `${CX - 480} ${CY - 480} 960 960`;

  const bands = buildDayBands(payload, domain);
  const precipRadii = buildPrecipRadii(payload, domain);
  const { annualMeanC, annualPrecipMm } = cityStats(payload);
  // Both reference grids ship; the unit toggle paints one (see isothermValuesF).
  const isosC = isothermValues(domain);
  const isosF = isothermValuesF(domain);
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
    + ` class="cf-poster${full ? ' cf-poster-full' : ''}"`
    + ` aria-label="${esc(payload.meta.name)} climate fingerprint">`);

  parts.push('<defs>');
  parts.push(`<filter id="glow-${uid}" x="-25%" y="-25%" width="150%" height="150%">`
    + `<feGaussianBlur stdDeviation="6" result="b"></feGaussianBlur>`
    + `<feMerge><feMergeNode in="b"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge></filter>`);
  parts.push(`<radialGradient id="vig-${uid}" cx="50%" cy="45%" r="62%">`
    + `<stop offset="60%" stop-color="#000" stop-opacity="0"></stop>`
    + `<stop class="cf-vig-stop" offset="100%" stop-color="#000"></stop></radialGradient>`);
  if (full) {
    // The bloom aperture. It ships fully open, so a render with no CSS, a paused animation, or
    // reduced-motion shows the finished poster — the reveal enhances a visible default, never gates it.
    parts.push(`<mask id="bloom-${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">`
      + `<circle class="cf-bloom-eye" cx="${CX}" cy="${CY}" r="${R_BLOOM}" fill="#fff"></circle></mask>`);
  }
  parts.push('</defs>');

  parts.push(`<rect width="${W}" height="${H}" fill="var(--bg)"></rect>`);

  const isoRing = (t: number, unitClass: string) =>
    `<circle class="${unitClass}" cx="${CX}" cy="${CY}" r="${rTemp(t, domain).toFixed(1)}" fill="none" stroke="var(--iso)" stroke-width="1"></circle>`;
  for (const f of isosF) parts.push(isoRing(fToC(f), 'cf-u-imp'));
  for (const t of isosC) parts.push(isoRing(t, 'cf-u-met'));

  if (full) {
    MONTH_STARTS.forEach((start, m) => {
      const [x0, y0] = polar(R_OUT + 4, angleForDoy(start));
      const [x1, y1] = polar(R_OUT + 12, angleForDoy(start));
      const [lx, ly] = polar(R_MONTH, angleForDoy(start + 15));
      parts.push(`<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="var(--hair)" stroke-width="1.2"></line>`);
      // Both spellings ship; below the mobile breakpoint the full name is swapped for its initial (T04 §6),
      // because at 94vw a 15px label renders under 6px.
      const at = `x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" letter-spacing="1"`;
      parts.push(`<text class="cf-mo cf-mo-full" ${at}>${MONTHS[m]}</text>`);
      parts.push(`<text class="cf-mo cf-mo-init" ${at}>${MONTHS[m][0]}</text>`);
    });
  }

  const bloomOpen = full ? ` class="cf-bloom" mask="url(#bloom-${uid})"` : '';
  parts.push(`<g${bloomOpen}>`);
  parts.push(`<path class="cf-precip" d="${precipPath}" fill="var(--precip)"></path>`);
  parts.push(`<g class="cf-ring" transform="translate(${CX}, ${CY})" filter="url(#glow-${uid})">`);
  bands.forEach((b, i) => {
    const a0 = angleForDoy(i + 1) - dayArc * 0.6;
    const a1 = angleForDoy(i + 1) + dayArc * 0.6;
    parts.push(`<path d="${dayPath(b.r0, b.r1, a0, a1)}" fill="${b.fill}"></path>`);
  });
  parts.push('</g>');
  parts.push('</g>');

  if (full) {
    // Values sit in a painted halo rather than a punched-out box, so a label reads over the ring without
    // cutting a hole through it — nine opaque boxes up one spoke was the old ladder.
    const isoLabel = (t: number, text: string, unitClass: string) => {
      const y = (CY - rTemp(t, domain) + 4).toFixed(1);
      return `<text class="cf-iso-label ${unitClass}" x="${CX}" y="${y}" text-anchor="middle"`
        + ` fill="var(--ink)" font-family="var(--sans)" paint-order="stroke" stroke="var(--bg)"`
        + ` stroke-linejoin="round">${text}</text>`;
    };
    // The 20°F grid is twice as dense as the 20°C one, so below the mobile breakpoint every second
    // Fahrenheit value drops out and the labels keep their air (T04 §6 legibility floor).
    for (const f of isosF) parts.push(isoLabel(fToC(f), `${f}°F`, f % 40 === 0 ? 'cf-u-imp' : 'cf-u-imp cf-iso-alt'));
    for (const t of labelledIsotherms(domain)) parts.push(isoLabel(t, `${t}°C`, 'cf-u-met'));

    const readoutImp = `${Math.round(cToF(annualMeanC))}°F avg · ${mmToIn(annualPrecipMm).toFixed(1)} in/yr`;
    const readoutMet = `${Math.round(annualMeanC)}°C avg · ${Math.round(annualPrecipMm)} mm/yr`;
    const readoutAt = `x="${CX}" y="${CY + 80}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)"`;
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DISC}" fill="var(--bg)"></circle>`);
    parts.push(`<text class="cf-name" x="${CX}" y="${CY - 12}" text-anchor="middle" fill="var(--ink)" font-family="var(--serif)" font-weight="500">${esc(payload.meta.name)}</text>`);
    parts.push(`<text class="cf-country" x="${CX}" y="${CY + 16}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" letter-spacing="3" font-weight="600">${esc(payload.meta.country.toUpperCase())}</text>`);
    parts.push(`<text class="cf-sig" x="${CX}" y="${CY + 50}" text-anchor="middle" fill="var(--ink)" font-family="var(--sans)">${esc(payload.signature)}</text>`);
    parts.push(`<text class="cf-readout cf-u-imp" ${readoutAt}>${readoutImp}</text>`);
    parts.push(`<text class="cf-readout cf-u-met" ${readoutAt}>${readoutMet}</text>`);
  }

  parts.push(`<rect width="${W}" height="${H}" fill="url(#vig-${uid})" pointer-events="none"></rect>`);
  parts.push('</svg>');
  return parts.join('');
}
