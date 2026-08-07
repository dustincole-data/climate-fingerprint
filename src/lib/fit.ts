// src/lib/fit.ts
// The centre block, laid out so it can never cross the ring.
//
// The four lines inside the disc (city, country, signature, readout) used to be four fixed font sizes at
// four fixed baselines. That worked for Denver and failed for 18 of the 30 curated cities: "San Francisco"
// set at 58 is 391 units wide and the disc has ~270 to give, so the name printed straight over the
// precipitation ring. A typed city is unbounded and could be far worse.
//
// The container is not the visible disc. R_DISC is `fill: var(--bg)` on a field of the same colour and
// nothing else paints inside r < R_IN (250) — the isotherm grid starts at 250 and the precipitation band
// runs OUTWARD from R_PBASE (160). So the only real boundary is the precip ring's inner edge at 160, and
// the text container can be grown toward it with no visual change to any poster at all. R_FIT is that
// boundary less a line of clear air.
//
// Everything here is pure: no DOM, no async. render.ts calls it at build time under Astro and again in the
// browser for a typed city, and both must produce the identical poster (T07 §1).
import { advanceWidth, fitWidth, type Face } from './textmetrics';

/** Text boundary: 14 units inside the precip ring at 160 — about one x-height at caption size. */
export const R_FIT = 146;

/**
 * The em box reserved above and below a baseline. Deliberately wider than Plex's real cap height (0.698)
 * and descender (0.22) so an accented cap — Reykjavík's í — is inside the reservation rather than outside
 * it. Over-reserving costs a fraction of a point of type; under-reserving is the bug this file exists for.
 */
const ASCENT = 0.76, DESCENT = 0.24;

/** Leading within a slot that wrapped to two lines. */
const LINE_FACTOR = 1.35;

/** The baselines the poster shipped with, before any of this existed. Only used to derive BLOCK_MID. */
const DESIGN_NAME_Y = -12, DESIGN_READOUT_Y = 80;

export type SlotName = 'name' | 'country' | 'signature' | 'readout';

const ORDER: SlotName[] = ['name', 'country', 'signature', 'readout'];

interface SlotSpec {
  face: Face;
  /** The designed size. A slot is never set larger than this — fitting only ever takes away. */
  size: number;
  floor: number;
  letterSpacing: number;
  wrap: boolean;
  /** Minimum distance from the previous slot's last baseline. `name` is first and has none. */
  gap: number;
}

const SPECS: Record<SlotName, SlotSpec> = {
  name: { face: 'serif500', size: 58, floor: 34, letterSpacing: 0, wrap: true, gap: 0 },
  // country's gap is the floor of gapAfterName, not a constant — see below.
  country: { face: 'sans600', size: 14.5, floor: 11, letterSpacing: 3, wrap: false, gap: 18 },
  signature: { face: 'sans400', size: 15.5, floor: 13.5, letterSpacing: 0, wrap: true, gap: 34 },
  readout: { face: 'sans400', size: 13.5, floor: 11.5, letterSpacing: 0, wrap: false, gap: 30 },
};

/**
 * The name-to-country gap tracks the name's size rather than sitting at a constant 28, so a city whose
 * name had to shrink closes up instead of leaving a hole where the big type used to be. 0.48 × 58 = 27.8,
 * i.e. the current poster, unchanged.
 */
const gapAfterName = (nameSize: number) => Math.max(SPECS.country.gap, nameSize * 0.48);

/**
 * Where the block's band centres, relative to CY — derived from the shipped poster rather than picked, so
 * a city that needs no fitting lands on the baselines it already had (within a tenth of a unit). Measured
 * with THIS file's reservation, not Plex's real cap height, because that is what the band means here.
 */
const BLOCK_MID = ((DESIGN_NAME_Y - ASCENT * SPECS.name.size) + (DESIGN_READOUT_Y + DESCENT * SPECS.readout.size)) / 2;

export interface FittedLine { text: string; y: number }
export interface FittedSlot { size: number; lines: FittedLine[] }
export type FittedBlock = Record<SlotName, FittedSlot>;

export interface BlockText {
  name: string;
  country: string;
  signature: string;
  /** The widest readout variant. Both unit spellings ship at one baseline, so the wider one sets the fit. */
  readout: string;
}

type Sizes = Record<SlotName, number>;
type Lines = Record<SlotName, string[]>;
type Baselines = Record<SlotName, number[]>;

/**
 * How much width a line has at `baseline`, given the chord of R_FIT at whichever end of its em box reaches
 * furthest from the centre. Per-line, not one flat number: a line near the block's extremes has less room
 * than one near the middle, and treating them alike is what makes a fitter either unsafe or too timid.
 */
function budget(baseline: number, size: number): number {
  const reach = Math.max(Math.abs(baseline - ASCENT * size), Math.abs(baseline + DESCENT * size));
  return 2 * Math.sqrt(Math.max(0, R_FIT * R_FIT - reach * reach));
}

/** Stack the present slots, then shift so the whole band centres on BLOCK_MID. */
function layout(sizes: Sizes, lines: Lines): Baselines {
  const out: Baselines = { name: [], country: [], signature: [], readout: [] };
  let y = 0;
  let first = true;
  // A slot with no text takes no baseline and no gap, but the slots after it must not close up tighter
  // than the widest gap they skipped — a poster with no country line still wants the name to breathe.
  let pending = 0;
  for (const key of ORDER) {
    const gap = key === 'country' ? gapAfterName(sizes.name) : SPECS[key].gap;
    if (!lines[key].length) { pending = Math.max(pending, gap); continue; }
    if (!first) y += Math.max(pending, gap);
    pending = 0;
    first = false;
    lines[key].forEach((_, i) => {
      if (i > 0) y += sizes[key] * LINE_FACTOR;
      out[key].push(y);
    });
  }

  const present = ORDER.filter(k => out[k].length);
  if (!present.length) return out;
  const head = present[0], tail = present[present.length - 1];
  const top = out[head][0] - ASCENT * sizes[head];
  const bottom = out[tail][out[tail].length - 1] + DESCENT * sizes[tail];
  const shift = BLOCK_MID - (top + bottom) / 2;
  for (const key of ORDER) out[key] = out[key].map(v => v + shift);
  return out;
}

function slotFits(key: SlotName, size: number, lines: Lines, baselines: Baselines): boolean {
  const spec = SPECS[key];
  return lines[key].every((text, i) => fitWidth(spec.face, text, size, spec.letterSpacing) <= budget(baselines[key][i], size));
}

/**
 * Largest size in [floor, design] this slot can hold at these baselines. Width rises and the chord budget
 * falls as the size grows, so "fits" is monotonic in size and a bisection is exact rather than a guess.
 */
function bestSize(key: SlotName, lines: Lines, baselines: Baselines): number {
  const spec = SPECS[key];
  if (!lines[key].length) return spec.size;
  if (slotFits(key, spec.size, lines, baselines)) return spec.size;
  if (!slotFits(key, spec.floor, lines, baselines)) return spec.floor;
  let lo = spec.floor, hi = spec.size;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (slotFits(key, mid, lines, baselines)) lo = mid; else hi = mid;
  }
  return lo;
}

/**
 * Sizes and baselines for one fixed choice of line counts. Shrinking a line raises its cap top, which
 * frees chord, which may allow a slightly larger size — so sizes and the stack are solved together.
 * Four passes is well past convergence; the second usually only recovers a point.
 */
function solve(lines: Lines): { sizes: Sizes; baselines: Baselines; over: boolean } {
  const sizes: Sizes = { name: SPECS.name.size, country: SPECS.country.size, signature: SPECS.signature.size, readout: SPECS.readout.size };
  let baselines = layout(sizes, lines);
  for (let pass = 0; pass < 4; pass++) {
    baselines = layout(sizes, lines);
    let moved = false;
    for (const key of ORDER) {
      const next = bestSize(key, lines, baselines);
      if (Math.abs(next - sizes[key]) > 0.01) { sizes[key] = next; moved = true; }
    }
    if (!moved) break;
  }
  // Settle on the final stack, then verify every slot against THOSE baselines. If a size drops here the
  // block is shorter than the one we laid out, so each band sits inside the reservation and stays safe;
  // re-centring on it would only start the loop again.
  baselines = layout(sizes, lines);
  for (const key of ORDER) sizes[key] = Math.min(sizes[key], bestSize(key, lines, baselines));
  const over = ORDER.some(key => lines[key].length && !slotFits(key, sizes[key], lines, baselines));
  return { sizes, baselines, over };
}

/** Break after a space (the space is dropped) or after a hyphen (it stays on the first line). */
function breakPoints(text: string): number[] {
  const points: number[] = [];
  for (let i = 1; i < text.length - 1; i++) {
    if (text[i] === ' ') points.push(i);
    else if (text[i] === '-') points.push(i + 1);
  }
  return points;
}

/** Two lines, split where the wider of them is narrowest. Measured at size 1 — the choice is scale-free. */
function wrapBalanced(face: Face, text: string): string[] {
  let best: string[] | null = null;
  let bestScore = Infinity;
  for (const point of breakPoints(text)) {
    const left = text.slice(0, point).trimEnd();
    const right = text.slice(text[point] === ' ' ? point + 1 : point).trimStart();
    if (!left || !right) continue;
    const score = Math.max(advanceWidth(face, left, 1), advanceWidth(face, right, 1));
    if (score < bestScore) { bestScore = score; best = [left, right]; }
  }
  return best ?? [text];
}

/** Longest prefix plus an ellipsis that still fits. The backstop no real city should ever reach. */
function truncate(face: Face, text: string, size: number, letterSpacing: number, room: number): string {
  if (fitWidth(face, text, size, letterSpacing) <= room) return text;
  const chars = [...text];
  for (let n = chars.length - 1; n > 0; n--) {
    const candidate = chars.slice(0, n).join('').trimEnd() + '…';
    if (fitWidth(face, candidate, size, letterSpacing) <= room) return candidate;
  }
  return '…';
}

/**
 * Fit the centre block. Shrink first, wrap only when a slot bottoms out at its floor, truncate only when a
 * single unbreakable token still will not go. No curated city reaches the wrap path — the smallest fitted
 * name is 40 — so wrapping and truncation exist for typed cities, which have no upper bound on length.
 */
export function fitCenterBlock(text: BlockText): FittedBlock {
  const one = (value: string) => (value ? [value] : []);
  const nameOptions = SPECS.name.wrap && breakPoints(text.name).length
    ? [one(text.name), wrapBalanced(SPECS.name.face, text.name)]
    : [one(text.name)];
  const sigOptions = SPECS.signature.wrap && breakPoints(text.signature).length
    ? [one(text.signature), wrapBalanced(SPECS.signature.face, text.signature)]
    : [one(text.signature)];

  // Fewest lines wins, so a poster only ever wraps because it had to. If nothing fits — a single
  // unbreakable token longer than the disc — the most-wrapped attempt is kept, because it is the one
  // truncation has to cut least.
  let chosen: { lines: Lines; solved: ReturnType<typeof solve> } | null = null;
  outer: for (const nameLines of nameOptions) {
    for (const sigLines of sigOptions) {
      const lines: Lines = { name: nameLines, country: one(text.country), signature: sigLines, readout: one(text.readout) };
      const solved = solve(lines);
      chosen = { lines, solved };
      if (!solved.over) break outer;
    }
  }

  const { lines, solved } = chosen!;
  const block = {} as FittedBlock;
  for (const key of ORDER) {
    const spec = SPECS[key];
    const size = solved.sizes[key];
    block[key] = {
      size,
      lines: lines[key].map((value, i) => {
        const y = solved.baselines[key][i];
        return { text: truncate(spec.face, value, size, spec.letterSpacing, budget(y, size)), y };
      }),
    };
  }
  return block;
}
