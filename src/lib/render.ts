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

export const W = 1000, H = 1414, CX = 500, CY = 620;
const R_OUT = 430, R_DISC = 140, R_PBASE = 160, R_MONTH = R_OUT + 46;
/** Fully-open bloom mask radius — past R_OUT + the month ring so nothing is ever clipped at rest. */
const R_BLOOM = 520;

/* Colophon baselines. The sheet is A4 and the mark is a circle, so the ~290 units under the month ring were
   dead paper — a print reads as unfinished without a footer. CY is pulled above the geometric centre so the
   ring block (topmost ink at 152) and the colophon (last baseline 1240) sit on print margins: ~11% of the
   sheet above, ~12% below, bottom-heavier the way a framed poster wants. Changing CY moves the tile crop
   with it; both read the same constant. */
const FOOT_RULE_Y = 1146, FOOT_MARK_Y = 1180, FOOT_PLACE_Y = 1212, FOOT_SOURCE_Y = 1244;
const FOOT_RULE_HALF = 120;
const SITE = 'climatefingerprint.dustincoledata.com';
/** Clearance a ladder value needs from the day band: half a label plus what the 6-unit Bremer blur washes. */
const GLOW_PAD = 14;

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

/**
 * An isotherm ring with a gutter cut at 12 o'clock for the value ladder. The half-width is a constant 30 user
 * units at every radius rather than a constant angle, so the gap reads as one parallel-sided channel through
 * the grid instead of a wedge — the numbers sit in clean air rather than crossing ring after ring.
 */
function isoArcPath(r: number): string {
  const half = Math.min(30 / r, 0.4);
  const [x0, y0] = polar(r, half);
  const [x1, y1] = polar(r, 2 * Math.PI - half);
  return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 1 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
}

/** "39.75° N" — absolute value plus a hemisphere letter, the way a map margin prints it. */
function coord(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(2)}° ${value >= 0 ? positive : negative}`;
}

export function renderPosterSvg(payload: CityPayload, domain: Domain, options: RenderOptions = {}): string {
  const { mode = 'full' } = options;
  const full = mode === 'full';
  // Unique per-instance ids so multiple posters in one document (the gallery wall) don't collide on url(#…).
  const uid = payload.meta.slug;
  // The tile crop is drawn in tight: 450 clears the outermost mark (R_OUT 430) and the halo it throws, and
  // nothing beyond that is ever painted — the old 480 spent 12% of every wall tile on empty ground.
  const viewBox = full ? `0 0 ${W} ${H}` : `${CX - 450} ${CY - 450} 900 900`;

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
  if (full) {
    parts.push(`<radialGradient id="vig-${uid}" cx="50%" cy="45%" r="62%">`
      + `<stop offset="60%" stop-color="#000" stop-opacity="0"></stop>`
      + `<stop class="cf-vig-stop" offset="100%" stop-color="#000"></stop></radialGradient>`);
    // The bloom aperture. It ships fully open, so a render with no CSS, a paused animation, or
    // reduced-motion shows the finished poster — the reveal enhances a visible default, never gates it.
    parts.push(`<mask id="bloom-${uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">`
      + `<circle class="cf-bloom-eye" cx="${CX}" cy="${CY}" r="${R_BLOOM}" fill="#fff"></circle></mask>`);
  }
  parts.push('</defs>');

  parts.push(`<rect width="${W}" height="${H}" fill="var(--bg)"></rect>`);

  // The full poster's grid is cut for the ladder's gutter; a tile carries no labels, so its rings stay whole.
  const isoRing = (t: number, unitClass: string) => {
    const r = rTemp(t, domain);
    return full
      ? `<path class="${unitClass}" d="${isoArcPath(r)}" fill="none" stroke="var(--iso)" stroke-width="1"></path>`
      : `<circle class="${unitClass}" cx="${CX}" cy="${CY}" r="${r.toFixed(1)}" fill="none" stroke="var(--iso)" stroke-width="1"></circle>`;
  };
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
    // The value ladder. It reads in the gutter cut through the isotherm grid, quiet enough to stay reference
    // rather than headline — and a value whose radius lands under the day band at 12 o'clock is dropped rather
    // than drawn: the ring is opaque and glowing there, so the label would only ever print as a sliced half.
    // Which values survive is per-city and per-unit; the grid rings all remain, so the scale still reads.
    const noon = bands[0];
    const clear = (t: number) => {
      const r = rTemp(t, domain);
      return r < noon.r0 - GLOW_PAD || r > noon.r1 + GLOW_PAD;
    };
    const isoLabel = (t: number, text: string, unitClass: string) => {
      const y = (CY - rTemp(t, domain) + 4).toFixed(1);
      return `<text class="cf-iso-label ${unitClass}" x="${CX}" y="${y}" text-anchor="middle"`
        + ` fill="var(--muted)" font-family="var(--sans)" paint-order="stroke" stroke="var(--bg)"`
        + ` stroke-linejoin="round">${text}</text>`;
    };
    // The 20°F grid is twice as dense as the 20°C one, so below the mobile breakpoint every second
    // Fahrenheit value drops out and the labels keep their air (T04 §6 legibility floor).
    for (const f of isosF) {
      if (clear(fToC(f))) parts.push(isoLabel(fToC(f), `${f}°F`, f % 40 === 0 ? 'cf-u-imp' : 'cf-u-imp cf-iso-alt'));
    }
    for (const t of labelledIsotherms(domain)) {
      if (clear(t)) parts.push(isoLabel(t, `${t}°C`, 'cf-u-met'));
    }

    const readoutImp = `${Math.round(cToF(annualMeanC))}°F avg · ${mmToIn(annualPrecipMm).toFixed(1)} in/yr`;
    const readoutMet = `${Math.round(annualMeanC)}°C avg · ${Math.round(annualPrecipMm)} mm/yr`;
    const readoutAt = `x="${CX}" y="${CY + 80}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)"`;
    parts.push(`<circle cx="${CX}" cy="${CY}" r="${R_DISC}" fill="var(--bg)"></circle>`);
    parts.push(`<text class="cf-name" x="${CX}" y="${CY - 12}" text-anchor="middle" fill="var(--ink)" font-family="var(--serif)" font-weight="500">${esc(payload.meta.name)}</text>`);
    parts.push(`<text class="cf-country" x="${CX}" y="${CY + 16}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)" letter-spacing="3" font-weight="600">${esc(payload.meta.country.toUpperCase())}</text>`);
    parts.push(`<text class="cf-sig" x="${CX}" y="${CY + 50}" text-anchor="middle" fill="var(--ink)" font-family="var(--sans)">${esc(payload.signature)}</text>`);
    parts.push(`<text class="cf-readout cf-u-imp" ${readoutAt}>${readoutImp}</text>`);
    parts.push(`<text class="cf-readout cf-u-met" ${readoutAt}>${readoutMet}</text>`);

    // ---- Colophon --------------------------------------------------------------------------------------
    // The sheet's baseline block. It travels inside the download, which is the point: a framed print carries
    // its own provenance, and the mark is what makes the poster attributable once it leaves the page. Centred,
    // because everything above it is. The reading key stays OFF the face (T04 §4) — this is credit, not legend.
    const { lat, lon, elevation_m } = payload.meta.resolved;
    const { start, end } = payload.meta.window;
    const place = `${coord(lat, 'N', 'S')} · ${coord(lon, 'E', 'W')}`;
    // Open-Meteo omits elevation for some typed cities; the line simply loses its third field rather than
    // printing "NaN m" on a poster somebody is about to frame.
    const elevation = Number.isFinite(elevation_m)
      ? { met: `${Math.round(elevation_m).toLocaleString('en-US')} m`, imp: `${Math.round(elevation_m * 3.28084).toLocaleString('en-US')} ft` }
      : null;
    const footAt = `x="${CX}" text-anchor="middle" fill="var(--muted)" font-family="var(--sans)"`;

    parts.push(`<line x1="${CX - FOOT_RULE_HALF}" y1="${FOOT_RULE_Y}" x2="${CX + FOOT_RULE_HALF}" y2="${FOOT_RULE_Y}"`
      + ` stroke="var(--hair)" stroke-width="1"></line>`);
    parts.push(`<text class="cf-mark" x="${CX}" y="${FOOT_MARK_Y}" text-anchor="middle" fill="var(--ink)"`
      + ` font-family="var(--sans)" font-weight="600" letter-spacing="3.2">CLIMATE FINGERPRINT</text>`);
    if (elevation) {
      parts.push(`<text class="cf-foot cf-u-imp" ${footAt} y="${FOOT_PLACE_Y}">${place} · ${elevation.imp}</text>`);
      parts.push(`<text class="cf-foot cf-u-met" ${footAt} y="${FOOT_PLACE_Y}">${place} · ${elevation.met}</text>`);
    } else {
      parts.push(`<text class="cf-foot" ${footAt} y="${FOOT_PLACE_Y}">${place}</text>`);
    }
    // Two spellings of the source line, swapped at the same breakpoint the month names use: at 0.35 scale the
    // long one would set at 5px, and an A4 export re-reads the desktop sizes so the print always gets it in full.
    parts.push(`<text class="cf-foot cf-foot-long" ${footAt} y="${FOOT_SOURCE_Y}">`
      + `Daily normals ${start}–${end} · ERA5 via Open-Meteo · ${SITE}</text>`);
    parts.push(`<text class="cf-foot cf-foot-short" ${footAt} y="${FOOT_SOURCE_Y}">`
      + `Normals ${start}–${end} · ERA5 / Open-Meteo</text>`);
  }

  // A tile is 180px of ring on a wall, where the vignette is not depth but haze — and its gradient stopped at
  // the SVG's edge while the caption below kept the flat ground, drawing a seam across all 30 (loud on light).
  if (full) parts.push(`<rect width="${W}" height="${H}" fill="url(#vig-${uid})" pointer-events="none"></rect>`);
  parts.push('</svg>');
  return parts.join('');
}
