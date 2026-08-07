// scripts/og.ts
// `npm run og` — build-time social share cards (T08 §4): a designed 1200x630 landscape card per curated
// city (ring left, name + readout + brand mark right) plus one generic branded card for arbitrary/typed
// cities. Namesake's `npm run og` pattern reused verbatim (T08 §9): satori vectorizes text to <path> so
// resvg never has to shape a glyph, and loadSystemFonts:false skips the OS font-DB scan. resvg renders
// <radialGradient> natively (unlike feGaussianBlur, T04 §2's glow), so the halo is baked as one here rather
// than reusing the live poster's blur filter.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { formatHex, oklch } from 'culori';
import { readCitiesManifest, readCityPayload, readDomain } from '../src/lib/data.ts';
import { buildDayBands, buildPrecipRadii } from '../src/lib/poster.ts';
import { angleForDoy, N } from '../src/lib/geometry.ts';
import { fitWidth } from '../src/lib/textmetrics.ts';
import { cToF, mmToIn } from '../src/lib/units.ts';
import type { CityManifestEntry, CityPayload, Domain } from '../src/lib/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'og');
const W = 1200, H = 630;

// The card's ring is the same buildDayBands/buildPrecipRadii math the live poster draws from (one
// source of truth across poster, exports and OG), scaled down and recentered into the card's left half.
const CX = 300, CY = H / 2;
const K = 260 / 430; // poster's R_OUT (430) -> this card's ring radius (260)

// Light-ground tokens (tokens.css :root) baked to sRGB hex — resvg/satori don't honor oklch(). The card
// follows the site's default ground: a dark share image landing next to a near-white page reads as a
// different product. The dark ground's halo comes with it — a spotlight glow needs dark to read, so on
// near-white it is dropped and the light ground's hairline does the segment separation instead (T04 §2).
const BG = formatHex(oklch('oklch(98.6% .002 250)'))!;
const INK = '#241f1a';
const MUTED = '#736c62';
const SEG_STROKE = 'rgba(30,25,20,0.16)';

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
    return { type: 'path', props: { d, fill: bake(b.fill), stroke: SEG_STROKE, 'stroke-width': 0.5 } };
  });

  return [
    { type: 'path', props: { d: precipD, fill: bake('oklch(52% .09 240)'), 'fill-opacity': 0.55 } },
    ...dayPaths,
  ];
}

/**
 * What the name is fitted to. The column itself runs to the card's right edge, so the fit budget holds
 * back a gutter matching the block's own 24 left margin — a shrunk name that stops one pixel short of the
 * bleed still reads as an accident. Every card that exists today is far inside this, so it costs nothing.
 */
export const NAME_BOX = W * 0.5 - 24 - 24;
export const NAME_SIZE = 62;
/** Below this the name stops reading as the card's headline, so a token that will not go is cut instead. */
export const NAME_FLOOR = 38;

/** Longest prefix plus an ellipsis that fits the column. The backstop for a token still over at the floor. */
function truncateToken(token: string, size: number): string {
  if (fitWidth('serif500', token, size) <= NAME_BOX) return token;
  const chars = [...token];
  for (let n = chars.length - 1; n > 0; n--) {
    const candidate = chars.slice(0, n).join('') + '…';
    if (fitWidth('serif500', candidate, size) <= NAME_BOX) return candidate;
  }
  return '…';
}

/**
 * Satori wraps the name at its spaces by itself, so the only thing that can run off a card is a single
 * token wider than the column: "Thiruvananthapuram" set at 62 measures 648 against a 576-wide box and
 * prints clipped at the card's right edge. Shrink until the widest token fits, then ellipsize only if the
 * floor still will not hold it — the poster's own shrink-then-truncate ladder (fit.ts), measured with the
 * same committed advance tables (textmetrics.ts) rather than a second estimator. No curated city reaches
 * either path: all 30 set at the designed 62, so this changes no card that exists today.
 */
export function fitName(name: string): { size: number; text: string } {
  const tokens = name.split(' ');
  // fitWidth is linear in size at zero letter-spacing, so the exact size is one division, not a search.
  const widest = Math.max(...tokens.map(t => fitWidth('serif500', t, NAME_SIZE)));
  const size = Math.max(NAME_FLOOR, Math.min(NAME_SIZE, (NAME_SIZE * NAME_BOX) / widest));
  return { size, text: tokens.map(t => truncateToken(t, size)).join(' ') };
}

function cardTree(rawName: string, readout: string, ring: unknown[]) {
  const name = fitName(rawName);
  return {
    type: 'div',
    props: {
      style: { width: W, height: H, display: 'flex', alignItems: 'center', background: BG },
      children: [
        { type: 'svg', props: { width: W * 0.5, height: H, viewBox: `0 0 ${W * 0.5} ${H}`, children: ring } },
        {
          type: 'div', props: {
            style: { display: 'flex', flexDirection: 'column', width: W * 0.5 - 24, marginLeft: 24 }, children: [
              { type: 'div', props: { style: { fontFamily: 'IBM Plex Serif', fontWeight: 500, fontSize: name.size, lineHeight: 1.1, color: INK }, children: name.text } },
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
    // Imperial, and worded exactly like the poster's own readout (render.ts readoutImp): the card is the
    // first thing a sharer sees of the site, and the site opens on °F (Boot.astro's default unit).
    const readout = `${Math.round(cToF(entry.summary.annual_mean_c))}°F avg · ${mmToIn(entry.summary.annual_precip_mm).toFixed(1)} in/yr`;
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

// Guarded so og.test.ts can import the fitter without building 31 cards to do it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
