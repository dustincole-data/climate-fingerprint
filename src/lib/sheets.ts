// src/lib/sheets.ts
// The sheet the poster prints on.
//
// The poster was A4 and only A4 — 1000 × 1414 user units, exported at 2480 × 3508. A photo shop prints
// 8×10, 11×14, 12×18, 16×20 and 4×6, and A4 is none of them, so every print was going to be cropped or
// letterboxed. Worse, the art reached to within 2.35% of the sheet edge (the "Apr" and "Oct" month
// labels), which is inside the crop tolerance of a borderless print — the labels were going to be cut.
//
// The fix is that all poster ink now lives in ONE rigid group, uniformly scaled, with a real margin. Since
// the composition is 956 × 1103 and every offered ratio is taller than it is wide, WIDTH binds the scale on
// all of them — so the scale is identical on every sheet and a different print size is only a different
// sheet height plus a vertical translate. No re-render, no second layout, no renderer in a page bundle.

/**
 * Sheet width, and the centre line everything on the poster is set on. These live here rather than in
 * render.ts because render.ts imports this module — the sheet is the frame the art is drawn into.
 */
export const W = 1000, CX = 500;

/** Union ink box of the full poster in art coordinates, measured across all 30 curated cities, padded ~1.5. */
const ART_INK = { x0: 22, y0: 147, x1: 978, y1: 1250 };

/** Ink-free border on the left and right edges, as a fraction of the sheet width. A lab crops 2–3%. */
const SIDE_MARGIN = 0.05;

/**
 * Vertical slack goes 46% above / 54% below, keeping the bottom-heavier weighting a framed poster wants —
 * and which the A4 original already had (11% above the art, 12% below the colophon).
 */
const TOP_SHARE = 0.46;

/** One scale for every sheet: the width is what binds, and the width is the same on all of them. */
export const ART_SCALE = (W * (1 - 2 * SIDE_MARGIN)) / (ART_INK.x1 - ART_INK.x0);

const ART_DX = (W - (ART_INK.x1 - ART_INK.x0) * ART_SCALE) / 2 - ART_INK.x0 * ART_SCALE;

/** Height of the scaled composition. Nothing shorter than this can carry the poster — see the 8×8 note. */
export const ART_INK_HEIGHT = (ART_INK.y1 - ART_INK.y0) * ART_SCALE;

export interface Sheet {
  id: string;
  label: string;
  /** Sheet height in user units. Width is always W. */
  h: number;
  /** PNG pixel size at 300 dpi. */
  px: [number, number];
}

/**
 * Six sizes over four ratios. 4×6 and 12×18 are the same sheet, as are 8×10 and 16×20 — only the pixel
 * count differs, so a small print and a large one come off one layout.
 *
 * 8×8 is deliberately absent. A square sheet is 1000 units tall and the composition is ~1038, so it does
 * not fit at any vertical placement; a square needs the ring shrunk and the colophon re-blocked, which is
 * a different design rather than another row in this table.
 */
export const SHEETS: Sheet[] = [
  { id: 'a4', label: 'A4', h: 1414, px: [2480, 3508] },
  { id: '8x10', label: '8 × 10 in', h: 1250, px: [2400, 3000] },
  { id: '11x14', label: '11 × 14 in', h: (W * 14) / 11, px: [3300, 4200] },
  { id: '12x18', label: '12 × 18 in', h: 1500, px: [3600, 5400] },
  { id: '16x20', label: '16 × 20 in', h: 1250, px: [4800, 6000] },
  { id: '4x6', label: '4 × 6 in', h: 1500, px: [1200, 1800] },
];

export const DEFAULT_SHEET = SHEETS[0];

export function sheetById(id: string | null | undefined): Sheet {
  return SHEETS.find(s => s.id === id) ?? DEFAULT_SHEET;
}

/** Vertical offset of the art group on a given sheet, from the ink box and the 46/54 split. */
export function artDy(h: number): number {
  return (h - ART_INK_HEIGHT) * TOP_SHARE - ART_INK.y0 * ART_SCALE;
}

/** The one transform every piece of poster ink sits under. */
export function artTransform(sheet: Sheet): string {
  return `translate(${ART_DX.toFixed(2)}, ${artDy(sheet.h).toFixed(2)}) scale(${ART_SCALE.toFixed(5)})`;
}

/** Where the ink actually lands on a sheet — the margins the print has. Used by the tests and the harness. */
export function inkBox(sheet: Sheet): { x0: number; y0: number; x1: number; y1: number } {
  const dy = artDy(sheet.h);
  return {
    x0: ART_DX + ART_INK.x0 * ART_SCALE,
    x1: ART_DX + ART_INK.x1 * ART_SCALE,
    y0: dy + ART_INK.y0 * ART_SCALE,
    y1: dy + ART_INK.y1 * ART_SCALE,
  };
}
