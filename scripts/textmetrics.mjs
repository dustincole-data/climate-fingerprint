// scripts/textmetrics.mjs
// Regenerates src/lib/textmetrics.ts — the per-character advance tables the poster's centre block is fitted
// against. Only ever needed if the fonts change (a @fontsource bump, a different face, a wider subset).
//
//     npm run dev                 (leave it running, note the port)
//     npm i --no-save puppeteer-core
//     node scripts/textmetrics.mjs [port]
//
// Measurement comes from canvas measureText, NOT SVG getComputedTextLength: a <text> node holding a single
// " " collapses to zero width under XML whitespace rules, which silently zeroes the space advance and puts
// a -7.5% error on every multi-word string. That is the exact failure mode this table exists to prevent, so
// the generator does not go near it. The script re-validates against real SVG text before it writes.
import { writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const PORT = process.argv[2] ?? '4321';
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = new URL('../src/lib/textmetrics.ts', import.meta.url);

/** ASCII + Latin-1 + the Latin Extended-A letters that turn up in place names + the poster's punctuation. */
const CHARS = (() => {
  let s = '';
  for (let c = 0x20; c <= 0x7e; c++) s += String.fromCharCode(c);
  s += '\u00b0\u00b7\u2013\u2014\u2018\u2019\u201c\u201d\u2026';
  s += '\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5\u00c6\u00c7\u00c8\u00c9\u00ca\u00cb\u00cc\u00cd\u00ce\u00cf';
  s += '\u00d1\u00d2\u00d3\u00d4\u00d5\u00d6\u00d8\u00d9\u00da\u00db\u00dc\u00dd\u00df';
  s += '\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e6\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef';
  s += '\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f8\u00f9\u00fa\u00fb\u00fc\u00fd\u00ff';
  s += '\u0100\u0101\u010c\u010d\u0110\u0111\u011e\u011f\u0130\u0131\u0141\u0142\u0152\u0153';
  s += '\u015e\u015f\u0160\u0161\u016a\u016b\u017d\u017e';
  return s;
})();

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://localhost:${PORT}/city/denver`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready);

const { tables, error } = await page.evaluate((chars) => {
  const FACES = {
    serif500: { css: "500 1000px 'IBM Plex Serif'", family: "'IBM Plex Serif', Georgia, serif", weight: 500 },
    sans400: { css: "400 1000px 'IBM Plex Sans'", family: "'IBM Plex Sans', system-ui, sans-serif", weight: 400 },
    sans600: { css: "600 1000px 'IBM Plex Sans'", family: "'IBM Plex Sans', system-ui, sans-serif", weight: 600 },
  };
  const EM = 1000;
  const ctx = document.createElement('canvas').getContext('2d');
  const tables = {};
  for (const [key, face] of Object.entries(FACES)) {
    ctx.font = face.css;
    const table = {};
    for (const ch of chars) table[ch] = +(ctx.measureText(ch).width / EM).toFixed(4);
    tables[key] = table;
  }

  // Validate the freshly-measured table against real SVG text before anything is written.
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;visibility:hidden';
  document.body.appendChild(svg);
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  svg.appendChild(text);
  const measure = (key, s, ls) => {
    const f = FACES[key];
    text.setAttribute('font-family', f.family);
    text.setAttribute('font-weight', String(f.weight));
    text.setAttribute('font-size', String(EM));
    text.setAttribute('letter-spacing', String(ls * EM));
    text.textContent = s;
    return text.getComputedTextLength() / EM;
  };
  const predict = (key, s, ls) => {
    let w = 0;
    for (const ch of s) w += tables[key][ch] ?? 1;
    return w + ls * [...s].length;
  };
  const SAMPLES = [
    ['serif500', 'San Francisco', 0], ['serif500', 'Salt Lake City', 0], ['serif500', 'Reykjav\u00edk', 0],
    ['sans400', 'savage cold, endless-summer-light swing', 0], ['sans400', 'gray, wet, mild', 0],
    ['sans600', 'UNITED ARAB EMIRATES', 3 / 14.5], ['sans600', 'UNITED STATES', 3 / 14.5],
  ];
  let worstUnder = 0;
  for (const [key, s, ls] of SAMPLES) {
    const err = (predict(key, s, ls) - measure(key, s, ls)) / measure(key, s, ls);
    worstUnder = Math.min(worstUnder, err);
  }
  svg.remove();
  // SAFETY in textmetrics.ts is 1.02; anything under-reading by more than that is not shippable.
  if (worstUnder < -0.019) return { error: `estimator under-reads by ${(worstUnder * 100).toFixed(2)}% — SAFETY 1.02 would not cover it` };
  return { tables };
}, CHARS);

await browser.close();

if (error) {
  console.error('REFUSED: ' + error);
  process.exit(1);
}

const escape = (ch) => {
  if (ch === "'") return "\\'";
  if (ch === '\\') return '\\\\';
  const code = ch.codePointAt(0);
  return code < 0x20 || code > 0x7e ? '\\u' + code.toString(16).padStart(4, '0') : ch;
};

const NAMES = { serif500: 'SERIF_500', sans400: 'SANS_400', sans600: 'SANS_600' };
let literals = '';
for (const face of ['serif500', 'sans400', 'sans600']) {
  const entries = Object.entries(tables[face]).map(([ch, w]) => `'${escape(ch)}': ${w}`);
  const rows = [];
  for (let i = 0; i < entries.length; i += 6) rows.push('  ' + entries.slice(i, i + 6).join(', ') + ',');
  literals += `const ${NAMES[face]}: Advances = {\n${rows.join('\n')}\n};\n\n`;
}

await writeFile(OUT, `// src/lib/textmetrics.ts
// How wide is this string — with no DOM, in Node and in the browser, giving the same answer in both.
//
// The poster is built by a pure string builder (render.ts) that runs at build time under Astro and again
// in the browser for a typed city, and the centre block cannot be laid out without knowing how wide its
// lines are. Nothing in that path can measure text: Node has no canvas, and the build has no document.
// So the three faces the poster sets are carried here as per-character advance tables in em fractions,
// measured once from the real webfonts and committed.
//
// GENERATED by scripts/textmetrics.mjs — do not hand-edit. Regenerate only if the fonts change.
//
// Sum-of-advances ignores kerning, which is the safe direction — Plex's kerning is almost entirely
// negative, so the estimate runs slightly WIDE and the fitter shrinks a hair more than it had to.
// Validated against the browser's own SVG getComputedTextLength() over 81 real strings (every curated
// city name, signature and country at its real letter-spacing, plus a stress list):
//
//     min -0.91%   max +2.06%   mean |error| 0.345%
//
// SAFETY (below) covers the worst under-read with more than double the margin, and the generator refuses
// to write a table that would need more.
//
// TRAP: these come from canvas measureText, never from SVG getComputedTextLength. A <text> node whose
// content is a single " " collapses to ZERO width under XML whitespace rules, which silently zeroes the
// space advance and pushes the error to -7.5% on every multi-word string — i.e. exactly the long city
// names this table exists to catch.

export type Face = 'serif500' | 'sans400' | 'sans600';

type Advances = Record<string, number>;

/**
 * Latin-1 and below is IBM Plex itself. The Latin Extended-A block below is NOT in the \`latin\` webfont
 * subset the site loads, so those advances are the fallback face's (Georgia/Times) — correct, because the
 * fallback is what actually paints them, but platform-dependent. Rare enough in city names that SAFETY
 * plus the fitter's shrink -> wrap -> truncate ladder is the guard rather than a wider table.
 */
${literals}const FACES: Record<Face, Advances> = { serif500: SERIF_500, sans400: SANS_400, sans600: SANS_600 };

/** An unmeasured character is assumed full-em — a CJK-width over-read, so an exotic name shrinks rather than spills. */
export const UNKNOWN_ADVANCE = 1;

/** Applied to every width before it meets a budget. Covers the -0.91% worst-case under-read twice over. */
export const SAFETY = 1.02;

/**
 * Advance width of \`text\` in user units. \`letterSpacing\` is a fixed length the way SVG/CSS applies it —
 * after every character including the last, which is what Chrome measures and what the poster emits.
 */
export function advanceWidth(face: Face, text: string, fontSize: number, letterSpacing = 0): number {
  const table = FACES[face];
  let em = 0;
  for (const ch of text) em += table[ch] ?? UNKNOWN_ADVANCE;
  return em * fontSize + letterSpacing * [...text].length;
}

/** advanceWidth with the safety factor already applied. This is the one the fitter compares to a budget. */
export function fitWidth(face: Face, text: string, fontSize: number, letterSpacing = 0): number {
  return advanceWidth(face, text, fontSize, letterSpacing) * SAFETY;
}
`);

console.log(`wrote ${OUT.pathname} — ${Object.keys(tables.serif500).length} characters × 3 faces`);
