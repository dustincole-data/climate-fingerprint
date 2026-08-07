// src/lib/export.ts
// The export row under the detail poster (T05 §8 / T08 §3): PNG at A4 300dpi, SVG vector, copy link.
//
// The live poster is deliberately CSS-driven — render.ts emits var() paints and the ground/unit rules resolve
// in global.css — and none of that survives leaving the page. A canvas rasterizes an <img> as an isolated
// document with no access to the page's cascade, and resvg / Illustrator / Preview have no cascade at all. So
// every export is FLATTENED first: each computed paint, opacity, stroke and font is written onto the element
// as a plain presentation attribute, every color is converted to sRGB (oklch travels nowhere), the fonts ride
// along as woff2 data URIs, and whatever CSS is hiding right now is deleted rather than shipped invisible.
// W comes from sheets.ts, not render.ts: importing the renderer here would drag it, d3-shape and the font
// metric tables into every city page's bundle to fetch one constant. The export row needs no renderer.
import { W, SHEETS, DEFAULT_SHEET, sheetById, artDy, type Sheet } from './sheets';
import serif500Url from '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-500-normal.woff2?url';
import sans400Url from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';
import sans600Url from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Remembers the size across downloads — nobody printing a set of five wants to pick it five times. */
const SHEET_KEY = 'cf-sheet';

/** Properties the cascade can be feeding that a standalone file has to carry itself. */
const PAINTS = ['fill', 'stroke', 'stop-color'] as const;
const TEXT_PROPS = ['font-family', 'font-weight', 'font-style'] as const;
/** Lengths worth writing as bare user units rather than "15px", so SVG 1.1 readers agree with SVG 2 ones. */
const LENGTHS = ['font-size', 'letter-spacing'] as const;

// ---- color ---------------------------------------------------------------------------------------------

interface Paint { hex: string; alpha: number; }

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
const trim = (n: number) => String(Number(n.toFixed(3)));
/** "15px" -> "15". Returns null for keywords like `normal`, which are left alone. */
function bare(value: string): string | null {
  const n = parseFloat(value);
  return Number.isFinite(n) ? trim(n) : null;
}

/**
 * getComputedStyle hands a color back in whatever space the author wrote it — the ramp and both grounds are
 * oklch, and it stays oklch. Legacy rgb()/rgba() is read straight off the string (exact); anything wider goes
 * through a 1x1 canvas, which is the browser's own conversion to sRGB and so matches the pixels on screen.
 */
function makeColorResolver(): (css: string) => Paint | null {
  const cache = new Map<string, Paint | null>();
  const legacy = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i;
  let ctx: CanvasRenderingContext2D | null | undefined;

  return (css: string): Paint | null => {
    const key = css.trim();
    if (!key || key === 'none') return null;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;

    let paint: Paint | null = null;
    const m = legacy.exec(key);
    if (m) {
      const alpha = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1);
      paint = { hex: `#${hex2(+m[1])}${hex2(+m[2])}${hex2(+m[3])}`, alpha };
    } else {
      if (ctx === undefined) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        ctx = canvas.getContext('2d', { willReadFrequently: true });
        // `copy` means the pixel IS the color rather than a blend onto whatever was under it.
        if (ctx) ctx.globalCompositeOperation = 'copy';
      }
      if (ctx) {
        ctx.fillStyle = key;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        paint = { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`, alpha: a / 255 };
      }
    }
    cache.set(key, paint);
    return paint;
  };
}

// ---- flatten -------------------------------------------------------------------------------------------

/**
 * Clone the live poster into a self-contained SVG: same pixels, no cascade. The live tree is walked alongside
 * the clone so every value read is the one currently on screen, which is how the export honors the ground and
 * unit toggles without knowing they exist.
 */
export function flattenPoster(live: SVGSVGElement): SVGSVGElement {
  const clone = live.cloneNode(true) as SVGSVGElement;
  const sources = [live, ...live.querySelectorAll<SVGElement>('*')];
  const targets = [clone, ...clone.querySelectorAll<SVGElement>('*')];
  const color = makeColorResolver();
  // Opts the poster out of the narrow-viewport type bumps for the length of this read, so a phone exports the
  // same A4 face a desktop does. Everything between here and the finally is synchronous, so it never paints.
  document.documentElement.toggleAttribute('data-exporting', true);
  try {
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i], target = targets[i];
      const tag = target.tagName.toLowerCase();
      const inDefs = !!target.closest('defs');
      const cs = getComputedStyle(source);

      // What CSS hides here would otherwise ship inside the file and be painted by the next renderer: the idle
      // unit system, and the month spelling this viewport isn't using.
      if (!inDefs && cs.display === 'none') { target.remove(); continue; }
      // Inside defs only gradient stops carry paint; filter primitives take none of this.
      if (inDefs && tag !== 'stop') continue;

      for (const prop of PAINTS) {
        // A <g> or the root never paints itself, but .cf-ring's hairline (light ground) is a stroke on a <g>.
        if (prop === 'fill' && (tag === 'g' || tag === 'svg')) continue;
        // Every element computes a stop-color; only a gradient stop means anything by it.
        if (prop === 'stop-color' && tag !== 'stop') continue;
        const value = cs.getPropertyValue(prop);
        // url() is the vignette gradient — a reference, not a color, and it travels as written.
        if (!value || value === 'none' || value.startsWith('url(')) continue;
        const paint = color(value);
        if (!paint) continue;
        const opacityProp = prop === 'stop-color' ? 'stop-opacity' : `${prop}-opacity`;
        const own = Number(cs.getPropertyValue(opacityProp));
        const alpha = paint.alpha * (Number.isFinite(own) ? own : 1);
        target.setAttribute(prop, paint.hex);
        if (alpha < 1) target.setAttribute(opacityProp, trim(alpha));
        if (prop === 'stroke') {
          const width = bare(cs.strokeWidth);
          if (width !== null) target.setAttribute('stroke-width', width);
        }
      }

      if (cs.opacity !== '1') target.setAttribute('opacity', cs.opacity);
      // The glow is a dark-ground halo; on light, CSS turns it off and the attribute goes with it (T04 §2).
      if (cs.filter === 'none') target.removeAttribute('filter');

      if (tag === 'text' || tag === 'tspan') {
        for (const prop of TEXT_PROPS) target.setAttribute(prop, cs.getPropertyValue(prop));
        for (const prop of LENGTHS) {
          const length = bare(cs.getPropertyValue(prop));
          if (length !== null) target.setAttribute(prop, length);
        }
      }
    }
  } finally {
    document.documentElement.removeAttribute('data-exporting');
  }

  // The bloom aperture is a page reveal, not part of the artifact, and a mask is the least portable thing in
  // the file. It ships fully open, so dropping it changes nothing that was on screen.
  for (const masked of clone.querySelectorAll('[mask]')) masked.removeAttribute('mask');
  for (const mask of clone.querySelectorAll('mask')) mask.remove();

  clone.setAttribute('xmlns', SVG_NS);
  return clone;
}

// ---- sheets --------------------------------------------------------------------------------------------

/**
 * Re-compose the flattened poster onto a different print sheet.
 *
 * This is the whole print-size mechanism, and it is this small for one reason: the composition is a single
 * rigid group scaled from the sheet WIDTH, and every offered ratio is taller than it is wide — so the art
 * scale is identical on all of them and only the sheet height and the group's vertical offset change.
 * Nothing is re-rendered, no payload is refetched, and no city page carries the renderer to make it work.
 */
function resheet(clone: SVGSVGElement, sheet: Sheet): SVGSVGElement {
  const h = sheet.h.toFixed(2);
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', h);
  clone.setAttribute('viewBox', `0 0 ${W} ${h}`);
  // The ground and the vignette span the sheet rather than the art, so they follow its height.
  for (const rect of clone.querySelectorAll('.cf-sheet-bg, .cf-sheet-vig')) rect.setAttribute('height', h);
  const art = clone.querySelector<SVGGElement>('.cf-art');
  if (art) {
    const transform = art.getAttribute('transform') ?? '';
    art.setAttribute('transform', transform.replace(/translate\(([^,]+),[^)]+\)/, `translate($1, ${artDy(sheet.h).toFixed(2)})`));
  }
  return clone;
}

function currentSheet(): Sheet {
  try {
    return sheetById(localStorage.getItem(SHEET_KEY));
  } catch {
    return DEFAULT_SHEET; // private mode / storage disabled
  }
}

// ---- fonts ---------------------------------------------------------------------------------------------

const FACES = [
  { family: 'IBM Plex Serif', weight: 500, url: serif500Url },
  { family: 'IBM Plex Sans', weight: 400, url: sans400Url },
  { family: 'IBM Plex Sans', weight: 600, url: sans600Url },
];

let fontCss: Promise<string> | null = null;

/**
 * IBM Plex is a self-hosted webfont, and neither an <img>-rasterized SVG nor resvg will fetch it — both would
 * silently fall back to Georgia. So the three faces the poster actually uses ride inside the file as base64.
 * Fetched once per session, and a failure degrades to the fallback stack rather than losing the download.
 */
async function embeddedFontCss(): Promise<string> {
  if (!fontCss) {
    fontCss = Promise.all(FACES.map(async (face) => {
      const bytes = new Uint8Array(await (await fetch(face.url)).arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};`
        + `src:url(data:font/woff2;base64,${btoa(binary)}) format('woff2');}`;
    })).then(parts => parts.join('')).catch(() => '');
  }
  return fontCss;
}

// ---- outputs -------------------------------------------------------------------------------------------

export async function posterSvgString(live: SVGSVGElement, sheet: Sheet = DEFAULT_SHEET): Promise<string> {
  const clone = resheet(flattenPoster(live), sheet);
  const css = await embeddedFontCss();
  if (css) {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

/** What a 300dpi raster of this sheet failed at, and what the fallback resolution would be. */
export interface RasterResult { blob: Blob; dpi: number }

export async function posterPngBlob(live: SVGSVGElement, sheet: Sheet = DEFAULT_SHEET): Promise<RasterResult> {
  // The page's own copies of IBM Plex being resolved is what keeps the embedded ones out of a race with the
  // first raster.
  await document.fonts.ready;
  const source = await posterSvgString(live, sheet);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the poster image did not load'));
      image.src = url;
    });
    // 16×20 at 300dpi is 4800×6000 — 28.8 megapixels, ~115MB of RGBA. Desktop Chrome is fine with it;
    // iOS Safari caps canvas area and hands back a blank or null instead. Rather than fail the download,
    // drop to 200dpi, which is still a good print at that size, and say so.
    for (const dpi of [300, 200]) {
      const scale = dpi / 300;
      const w = Math.round(sheet.px[0] * scale), h = Math.round(sheet.px[1] * scale);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(image, 0, 0, w, h);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (blob) return { blob, dpi };
      } catch {
        // fall through to the smaller attempt
      }
    }
    throw new Error('the canvas did not encode');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `climate-fingerprint-denver-dark-11x14.png` — ground and sheet are both in the name because both ship. */
export function posterFilename(extension: string, sheet: Sheet = DEFAULT_SHEET): string {
  const slug = location.pathname.match(/^\/city\/([^/]+)/)?.[1] ?? 'poster';
  const ground = document.documentElement.dataset.ground === 'light' ? 'light' : 'dark';
  return `climate-fingerprint-${slug}-${ground}-${sheet.id}.${extension}`;
}

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---- the row -------------------------------------------------------------------------------------------

/** Markup lives here, not in the component, because the client shell injects the same row for typed cities. */
export function exportRowHtml(): string {
  const options = SHEETS.map(s => `<option value="${s.id}">${s.label}</option>`).join('');
  return `<div class="export">
  <div class="row">
    <button type="button" class="primary" data-export="png">Download poster</button>
    <label class="size">
      <span class="vh">Print size</span>
      <select data-sheet>${options}</select>
    </label>
    <button type="button" class="quiet" data-export="svg">SVG</button>
    <button type="button" class="quiet" data-export="link">Copy link</button>
  </div>
  <p class="fine"><span class="dims"></span><span class="status" role="status"></span></p>
</div>`;
}

/** "11 × 14 in · 3300 × 4200 · 300 dpi" — what this click is actually going to produce. */
function describe(sheet: Sheet): string {
  return `${sheet.label} · ${sheet.px[0]} × ${sheet.px[1]} · 300 dpi`;
}

async function copyLink(): Promise<string> {
  const url = location.href;
  // The share sheet is the right gesture on a phone and the wrong one on a desktop, where the same API opens
  // an OS dialog nobody asked a "Copy link" button for.
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: document.title, url });
      return '';
    } catch {
      return ''; // dismissed
    }
  }
  await navigator.clipboard.writeText(url);
  return 'Link copied.';
}

async function run(button: HTMLButtonElement, kind: string): Promise<void> {
  const row = button.closest('.export');
  const status = row?.querySelector('.status') ?? null;
  const poster = document.querySelector<SVGSVGElement>('svg.cf-poster-full');
  if (!poster) return;

  const sheet = currentSheet();
  const say = (message: string) => { if (status) status.textContent = message; };
  button.disabled = true;
  say(kind === 'png' ? `Rendering at ${sheet.label}…` : kind === 'svg' ? 'Writing the vector…' : '');
  try {
    if (kind === 'png') {
      const { blob, dpi } = await posterPngBlob(poster, sheet);
      save(blob, posterFilename('png', sheet));
      say(dpi === 300 ? 'Poster saved.' : `Poster saved at ${dpi} dpi — this device could not render ${sheet.label} at 300.`);
    } else if (kind === 'svg') {
      save(new Blob([await posterSvgString(poster, sheet)], { type: 'image/svg+xml;charset=utf-8' }), posterFilename('svg', sheet));
      say('Vector saved.');
    } else {
      say(await copyLink());
    }
  } catch {
    say(kind === 'link' ? 'Could not copy the link. Copy it from the address bar.' : 'That did not save. Try again in a moment.');
  } finally {
    button.disabled = false;
  }
}

/**
 * Reflect the stored size into every row on the page, including one the client shell injected late.
 * Writes only on a real change — this runs from a MutationObserver, and writing the same text back would
 * be a mutation of its own and loop forever.
 */
function syncSizeUi(): void {
  const sheet = currentSheet();
  const text = describe(sheet);
  for (const select of document.querySelectorAll<HTMLSelectElement>('[data-sheet]')) {
    if (select.value !== sheet.id) select.value = sheet.id;
  }
  for (const dims of document.querySelectorAll('.export .dims')) {
    if (dims.textContent !== text) dims.textContent = text;
  }
}

let wired = false;

/** Delegated from the document, so it covers the row the client shell injects after its data lands. */
export function wireExportRow(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-export]');
    if (button?.dataset.export) void run(button, button.dataset.export);
  });
  document.addEventListener('change', (event) => {
    const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>('[data-sheet]');
    if (!select) return;
    try { localStorage.setItem(SHEET_KEY, select.value); } catch { /* storage disabled; the pick still holds for this click */ }
    syncSizeUi();
  });
  syncSizeUi();
  // The typed-city shell injects its row after this runs, so pick it up when it lands.
  new MutationObserver(syncSizeUi).observe(document.body, { childList: true, subtree: true });
}
