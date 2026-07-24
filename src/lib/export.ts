// src/lib/export.ts
// The export row under the detail poster (T05 §8 / T08 §3): PNG at A4 300dpi, SVG vector, copy link.
//
// The live poster is deliberately CSS-driven — render.ts emits var() paints and the ground/unit rules resolve
// in global.css — and none of that survives leaving the page. A canvas rasterizes an <img> as an isolated
// document with no access to the page's cascade, and resvg / Illustrator / Preview have no cascade at all. So
// every export is FLATTENED first: each computed paint, opacity, stroke and font is written onto the element
// as a plain presentation attribute, every color is converted to sRGB (oklch travels nowhere), the fonts ride
// along as woff2 data URIs, and whatever CSS is hiding right now is deleted rather than shipped invisible.
import { W, H } from './render';
import serif500Url from '@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-500-normal.woff2?url';
import sans400Url from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url';
import sans600Url from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** A4 at 300dpi, the print target the primary button promises (T04 export dims). */
const PNG_W = 2480, PNG_H = 3508;

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
  clone.setAttribute('width', String(W));
  clone.setAttribute('height', String(H));
  return clone;
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

export async function posterSvgString(live: SVGSVGElement): Promise<string> {
  const clone = flattenPoster(live);
  const css = await embeddedFontCss();
  if (css) {
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}

export async function posterPngBlob(live: SVGSVGElement): Promise<Blob> {
  // The page's own copies of IBM Plex being resolved is what keeps the embedded ones out of a race with the
  // first raster.
  await document.fonts.ready;
  const source = await posterSvgString(live);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the poster image did not load'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = PNG_W;
    canvas.height = PNG_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(image, 0, 0, PNG_W, PNG_H);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('the canvas did not encode')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `climate-fingerprint-denver-dark.png` (T08 §3) — the ground is part of the name because both are shipped. */
export function posterFilename(extension: string): string {
  const slug = location.pathname.match(/^\/city\/([^/]+)/)?.[1] ?? 'poster';
  const ground = document.documentElement.dataset.ground === 'light' ? 'light' : 'dark';
  return `climate-fingerprint-${slug}-${ground}.${extension}`;
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
  return `<div class="export">
  <div class="row">
    <button type="button" class="primary" data-export="png">Download poster</button>
    <button type="button" class="quiet" data-export="svg">SVG</button>
    <button type="button" class="quiet" data-export="link">Copy link</button>
  </div>
  <p class="fine">A4 · 300 dpi<span class="status" role="status"></span></p>
</div>`;
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
  const status = button.closest('.export')?.querySelector('.status') ?? null;
  const poster = document.querySelector<SVGSVGElement>('svg.cf-poster-full');
  if (!poster) return;

  const say = (message: string) => { if (status) status.textContent = message; };
  button.disabled = true;
  say(kind === 'png' ? 'Rendering at A4…' : kind === 'svg' ? 'Writing the vector…' : '');
  try {
    if (kind === 'png') {
      save(await posterPngBlob(poster), posterFilename('png'));
      say('Poster saved.');
    } else if (kind === 'svg') {
      save(new Blob([await posterSvgString(poster)], { type: 'image/svg+xml;charset=utf-8' }), posterFilename('svg'));
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

let wired = false;

/** Delegated from the document, so it covers the row the client shell injects after its data lands. */
export function wireExportRow(): void {
  if (wired) return;
  wired = true;
  document.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('[data-export]');
    if (button?.dataset.export) void run(button, button.dataset.export);
  });
}
