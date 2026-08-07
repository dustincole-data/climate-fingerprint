// scripts/verify-poster.mjs
// The check the unit tests cannot make.
//
// fit.test.ts asks "does every line fit?" using textmetrics.ts — the same estimator the fitter used to
// place them. That is circular: if the table were wrong, both sides would be wrong together and the suite
// would still be green. This harness breaks the circle by loading every poster in real Chrome and reading
// real getBBox() values, which is how the original bug (18 of 30 cities crossing the ring) was found.
//
// It also composes each print sheet through the page's own export path and measures where the ink actually
// lands, so the margin promise is verified end to end rather than asserted from constants.
//
// Manual, not CI — it needs a browser and a running dev server:
//     npm run dev                 (leave it running, note the port)
//     npm i --no-save puppeteer-core
//     node scripts/verify-poster.mjs [port]
//
// Exits non-zero on any violation, and prints the offenders.
import { readFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const PORT = process.argv[2] ?? '4321';
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/** Must match fit.ts. Duplicated so the harness checks the contract, not the implementation. */
const R_FIT = 146, CY = 620;
/** Must match sheets.ts. */
const MIN_SIDE = 0.05, MIN_VERTICAL = 0.075;

const cities = JSON.parse(await readFile(new URL('../public/data/cities.json', import.meta.url), 'utf8'));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1200 });

const failures = [];
let worstReach = 0, worstCity = '';

for (const { slug } of cities) {
  await page.goto(`${BASE}/city/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);

  const result = await page.evaluate((R_FIT, CY) => {
    const svg = document.querySelector('svg.cf-poster-full');
    if (!svg) return { error: 'no poster' };
    // getBBox() on SVG text is the FONT's em box (ascent 1.025em / descent 0.275em for Plex Serif), not the
    // glyphs — using it here overstates the vertical reach by ~15 units and invents failures. Canvas
    // actualBoundingBox* is the real ink, which is what "touches the ring" means. It also comes from the
    // browser's own shaper rather than from textmetrics.ts, so this stays an independent check.
    const ctx = document.createElement('canvas').getContext('2d');
    const out = [];
    for (const el of svg.querySelectorAll('.cf-name, .cf-country, .cf-sig, .cf-readout')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      const baseline = parseFloat(el.getAttribute('y'));
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      ctx.textAlign = 'center';
      const m = ctx.measureText(el.textContent);
      const dx = Math.max(m.actualBoundingBoxLeft, m.actualBoundingBoxRight);
      const dy = Math.max(
        Math.abs(baseline - m.actualBoundingBoxAscent - CY),
        Math.abs(baseline + m.actualBoundingBoxDescent - CY),
      );
      out.push({ cls: el.getAttribute('class'), text: el.textContent, reach: +Math.hypot(dx, dy).toFixed(2) });
    }
    return { lines: out, over: out.filter(l => l.reach > R_FIT) };
  }, R_FIT, CY);

  if (result.error) { failures.push(`${slug}: ${result.error}`); continue; }
  for (const line of result.lines) {
    if (line.reach > worstReach) { worstReach = line.reach; worstCity = `${slug} ${line.cls}`; }
  }
  for (const line of result.over) {
    failures.push(`${slug}: ${line.cls} reaches ${line.reach} > ${R_FIT} — "${line.text}"`);
  }
}

// ---- sheets: compose each size through the real export path and measure where the ink lands -------------
await page.goto(`${BASE}/city/fairbanks`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => document.fonts.ready);

const sheetReport = await page.evaluate(async () => {
  // Vite serves the TypeScript sources in dev, so the harness can drive the page's own export code
  // rather than a copy of it.
  const { posterSvgString } = await import('/src/lib/export.ts');
  const { SHEETS } = await import('/src/lib/sheets.ts');
  const live = document.querySelector('svg.cf-poster-full');
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:1000px';
  document.body.appendChild(host);

  const rows = [];
  for (const sheet of SHEETS) {
    const source = await posterSvgString(live, sheet);
    host.innerHTML = source.replace(/^<\?xml[^>]*\?>\s*/, '');
    const svg = host.querySelector('svg');
    const declaredH = parseFloat(svg.getAttribute('height'));
    const root = svg.getCTM();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of svg.querySelectorAll('*')) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'rect' || tag === 'g' || tag === 'mask' || tag === 'defs' || tag === 'style' || el.closest('defs')) continue;
      let b; try { b = el.getBBox(); } catch { continue; }
      if (!b.width && !b.height) continue;
      const m = root.inverse().multiply(el.getCTM());
      for (const [px, py] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const x = m.a * px + m.c * py + m.e, y = m.b * px + m.d * py + m.f;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    rows.push({
      id: sheet.id, label: sheet.label, declaredH: +declaredH.toFixed(1), expectedH: +sheet.h.toFixed(1),
      left: +(x0 / 1000).toFixed(4), right: +((1000 - x1) / 1000).toFixed(4),
      top: +(y0 / declaredH).toFixed(4), bottom: +((declaredH - y1) / declaredH).toFixed(4),
    });
  }
  host.remove();
  return rows;
});

// ---- the raster the primary button actually produces ---------------------------------------------------
const rasterReport = await page.evaluate(async () => {
  const { posterPngBlob } = await import('/src/lib/export.ts');
  const { sheetById } = await import('/src/lib/sheets.ts');
  const live = document.querySelector('svg.cf-poster-full');
  const rows = [];
  // The smallest and the largest: 4×6 is 1200×1800, 16×20 is 4800×6000 (28.8 megapixels), which is where a
  // canvas is most likely to refuse and the 200dpi fallback earns its keep.
  for (const id of ['4x6', '16x20']) {
    const sheet = sheetById(id);
    const { blob, dpi } = await posterPngBlob(live, sheet);
    const bitmap = await createImageBitmap(blob);
    rows.push({ id, dpi, bytes: blob.size, w: bitmap.width, h: bitmap.height, want: sheet.px });
  }
  return rows;
});

await browser.close();

console.log('\n=== CENTRE BLOCK — furthest glyph from the disc centre (limit ' + R_FIT + ') ===');
console.log(`worst: ${worstReach} (${worstCity})`);

console.log('\n=== SHEETS — measured ink margins as a fraction of the sheet ===');
console.log('id        label        height    left    right     top  bottom');
for (const r of sheetReport) {
  if (Math.abs(r.declaredH - r.expectedH) > 0.5) failures.push(`${r.id}: height ${r.declaredH} != ${r.expectedH}`);
  for (const [edge, value, min] of [['left', r.left, MIN_SIDE], ['right', r.right, MIN_SIDE], ['top', r.top, MIN_VERTICAL], ['bottom', r.bottom, MIN_VERTICAL]]) {
    if (value < min) failures.push(`${r.id}: ${edge} margin ${(value * 100).toFixed(2)}% < ${(min * 100)}%`);
  }
  console.log(
    r.id.padEnd(9), r.label.padEnd(12), String(r.declaredH).padStart(7),
    (r.left * 100).toFixed(2).padStart(6) + '%', (r.right * 100).toFixed(2).padStart(6) + '%',
    (r.top * 100).toFixed(2).padStart(6) + '%', (r.bottom * 100).toFixed(2).padStart(6) + '%',
  );
}

console.log('\n=== PNG — what the download button hands you ===');
for (const r of rasterReport) {
  if (r.w !== r.want[0] || r.h !== r.want[1]) failures.push(`${r.id}: raster ${r.w}×${r.h} != ${r.want[0]}×${r.want[1]}`);
  if (r.dpi !== 300) failures.push(`${r.id}: fell back to ${r.dpi} dpi on a desktop browser`);
  console.log(`${r.id.padEnd(9)} ${String(r.w).padStart(5)} × ${String(r.h).padStart(5)}  ${r.dpi} dpi  ${(r.bytes / 1e6).toFixed(2)} MB`);
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('\nAll clear: no glyph crosses the ring, every sheet keeps its margins.');
