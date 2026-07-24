// scripts/og.ts
// `npm run og` — build-time social share cards (T08 §4): a designed 1200x630 landscape card per curated
// city (ring left, name + readout + brand mark right) plus one generic branded card for arbitrary/typed
// cities. Namesake's `npm run og` pattern reused verbatim (T08 §9): satori vectorizes text to <path> so
// resvg never has to shape a glyph, and loadSystemFonts:false skips the OS font-DB scan. resvg renders
// <radialGradient> natively (unlike feGaussianBlur, T04 §2's glow), so the halo is baked as one here rather
// than reusing the live poster's blur filter.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { formatHex, oklch } from 'culori';
import { readCitiesManifest, readCityPayload, readDomain } from '../src/lib/data.ts';
import { buildDayBands, buildPrecipRadii, rTemp } from '../src/lib/poster.ts';
import { angleForDoy, N } from '../src/lib/geometry.ts';
import type { CityManifestEntry, CityPayload, Domain } from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og');
const W = 1200, H = 630;

// The card's ring is the same rTemp/buildDayBands/buildPrecipRadii math the live poster draws from (one
// source of truth across poster, exports and OG), scaled down and recentered into the card's left half.
const CX = 300, CY = H / 2;
const K = 260 / 430; // poster's R_OUT (430) -> this card's ring radius (260)

// Dark-ground tokens (tokens.css :root, T04 §2) baked to sRGB hex — resvg/satori don't honor oklch().
const BG = formatHex(oklch('oklch(20% .02 250)'))!;
const INK = '#efece4';
const MUTED = '#8f8b83';
const HALO = INK; // a neutral spotlight glow reads on every city's palette; T04 doesn't tie the halo hue to data.

const bake = (oklchString: string): string => formatHex(oklch(oklchString)) ?? INK;

async function loadFonts() {
  const base = join(ROOT, 'node_modules', '@fontsource');
  return {
    serif: await readFile(join(base, 'ibm-plex-serif', 'files', 'ibm-plex-serif-latin-500-normal.woff')),
    sans400: await readFile(join(base, 'ibm-plex-sans', 'files', 'ibm-plex-sans-latin-400-normal.woff')),
    sans600: await readFile(join(base, 'ibm-plex-sans', 'files', 'ibm-plex-sans-latin-600-normal.woff')),
  };
}

/** The ring: day-color bands + the precip silhouette, satori <svg> passthrough, baked hex fills. */
function ringSvgChildren(payload: CityPayload, domain: Domain) {
  const bands = buildDayBands(payload, domain);
  const precipRadii = buildPrecipRadii(payload, domain);
  const rPBase = 160 * K;
  const dayArc = (2 * Math.PI) / N;
  const polar = (r: number, a: number): [number, number] => [CX + r * Math.sin(a), CY - r * Math.cos(a)];

  let precipD = '';
  for (let i = 0; i < N; i++) {
    const [x, y] = polar(rPBase + precipRadii[i] * K, angleForDoy(i + 1));
    precipD += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  for (let i = N - 1; i >= 0; i--) {
    const [x, y] = polar(rPBase, angleForDoy(i + 1));
    precipD += 'L' + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  precipD += 'Z';

  const haloR = rTemp(domain.tmax, domain) * K * 1.55;
  const dayPaths = bands.map((b, i) => {
    const a0 = angleForDoy(i + 1) - dayArc * 0.6;
    const a1 = angleForDoy(i + 1) + dayArc * 0.6;
    const r0 = b.r0 * K, r1 = b.r1 * K;
    const [x0a, y0a] = polar(r0, a0), [x1a, y1a] = polar(r1, a0);
    const [x1b, y1b] = polar(r1, a1), [x0b, y0b] = polar(r0, a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = `M${x0a.toFixed(1)},${y0a.toFixed(1)} L${x1a.toFixed(1)},${y1a.toFixed(1)} `
      + `A${r1.toFixed(1)},${r1.toFixed(1)} 0 ${large} 1 ${x1b.toFixed(1)},${y1b.toFixed(1)} `
      + `L${x0b.toFixed(1)},${y0b.toFixed(1)} A${r0.toFixed(1)},${r0.toFixed(1)} 0 ${large} 0 ${x0a.toFixed(1)},${y0a.toFixed(1)} Z`;
    return { type: 'path', props: { d, fill: bake(b.fill) } };
  });

  return [
    {
      type: 'defs', props: { children: [{
        type: 'radialGradient', props: { id: 'halo', cx: '50%', cy: '50%', r: '50%', children: [
          { type: 'stop', props: { offset: '0%', 'stop-color': HALO, 'stop-opacity': 0.22 } },
          { type: 'stop', props: { offset: '55%', 'stop-color': HALO, 'stop-opacity': 0.09 } },
          { type: 'stop', props: { offset: '100%', 'stop-color': HALO, 'stop-opacity': 0 } },
        ] },
      }] },
    },
    { type: 'circle', props: { cx: CX, cy: CY, r: haloR, fill: 'url(#halo)' } },
    { type: 'path', props: { d: precipD, fill: bake('oklch(72% .075 235)'), 'fill-opacity': 0.5 } },
    ...dayPaths,
  ];
}

function cardTree(name: string, readout: string, ring: unknown[]) {
  return {
    type: 'div',
    props: {
      style: { width: W, height: H, display: 'flex', alignItems: 'center', background: BG },
      children: [
        { type: 'svg', props: { width: W * 0.5, height: H, viewBox: `0 0 ${W * 0.5} ${H}`, children: ring } },
        {
          type: 'div', props: {
            style: { display: 'flex', flexDirection: 'column', width: W * 0.5 - 24, marginLeft: 24 }, children: [
              { type: 'div', props: { style: { fontFamily: 'IBM Plex Serif', fontWeight: 500, fontSize: 62, lineHeight: 1.1, color: INK }, children: name } },
              { type: 'div', props: { style: { fontFamily: 'IBM Plex Sans', fontWeight: 400, fontSize: 27, lineHeight: 1.3, color: MUTED, marginTop: 16 }, children: readout } },
              {
                type: 'div', props: {
                  style: {
                    fontFamily: 'IBM Plex Sans', fontWeight: 600, fontSize: 18, letterSpacing: 1.5,
                    textTransform: 'uppercase', color: MUTED, marginTop: 40,
                  },
                  children: 'climatefingerprint.dustincoledata.com',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

async function render(tree: unknown, fonts: Awaited<ReturnType<typeof loadFonts>>): Promise<Buffer> {
  const svg = await satori(tree as any, {
    width: W, height: H,
    fonts: [
      { name: 'IBM Plex Serif', data: fonts.serif, weight: 500, style: 'normal' },
      { name: 'IBM Plex Sans', data: fonts.sans400, weight: 400, style: 'normal' },
      { name: 'IBM Plex Sans', data: fonts.sans600, weight: 600, style: 'normal' },
    ],
  });
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const fonts = await loadFonts();
  const manifest = await readCitiesManifest();
  const domain = await readDomain();

  for (const entry of manifest as CityManifestEntry[]) {
    const payload = await readCityPayload(entry.slug);
    const readout = `avg ${Math.round(entry.summary.annual_mean_c)}°C · ${Math.round(entry.summary.annual_precip_mm)} mm/yr`;
    const tree = cardTree(entry.name, readout, ringSvgChildren(payload, domain));
    await writeFile(join(OUT, `${entry.slug}.png`), await render(tree, fonts));
  }

  // Arbitrary (typed, non-curated) cities render client-side with no build-time page (T07), so they share
  // one generic branded card rather than a per-city one (T08 §4 — the rejected-edge-route consequence).
  const genericTree = cardTree(
    'Climate Fingerprint',
    "A city's typical year as one radial signature, drawn as one poster.",
    ringSvgChildren(await readCityPayload(manifest[0].slug), domain),
  );
  await writeFile(join(OUT, '_default.png'), await render(genericTree, fonts));

  console.log(`wrote ${manifest.length} curated OG cards + _default.png to ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
