import { describe, it, expect } from 'vitest';
import { SHEETS, DEFAULT_SHEET, sheetById, inkBox, artDy, artTransform, ART_INK_HEIGHT, ART_SCALE, W } from './sheets';

/** What the design promises a print: ink-free borders a photo lab's crop cannot reach into. */
const MIN_SIDE = 0.05, MIN_VERTICAL = 0.075;

describe('sheets', () => {
  it.each(SHEETS.map(s => [s.label, s] as const))('%s keeps the art inside the safe margins', (_label, sheet) => {
    const box = inkBox(sheet);
    expect(box.x0 / W).toBeGreaterThanOrEqual(MIN_SIDE);
    expect((W - box.x1) / W).toBeGreaterThanOrEqual(MIN_SIDE);
    expect(box.y0 / sheet.h).toBeGreaterThanOrEqual(MIN_VERTICAL);
    expect((sheet.h - box.y1) / sheet.h).toBeGreaterThanOrEqual(MIN_VERTICAL);
  });

  it.each(SHEETS.map(s => [s.label, s] as const))('%s centres the art horizontally', (_label, sheet) => {
    const box = inkBox(sheet);
    expect((box.x0 + box.x1) / 2).toBeCloseTo(W / 2, 6);
  });

  it.each(SHEETS.map(s => [s.label, s] as const))('%s pixel size matches its sheet ratio at 300 dpi', (_label, sheet) => {
    const [pw, ph] = sheet.px;
    // A4's 2480×3508 is the ISO pixel size and is 0.04% off 1000×1414; the inch sizes are exact.
    expect(Math.abs(ph / pw - sheet.h / W) / (sheet.h / W)).toBeLessThan(0.001);
  });

  it('sizes every inch sheet at exactly 300 dpi', () => {
    const INCHES: Record<string, [number, number]> = {
      '8x10': [8, 10], '11x14': [11, 14], '12x18': [12, 18], '16x20': [16, 20], '4x6': [4, 6],
    };
    for (const [id, [wIn, hIn]] of Object.entries(INCHES)) {
      const sheet = sheetById(id);
      expect(sheet.px).toEqual([wIn * 300, hIn * 300]);
    }
  });

  it('is one scale for every sheet — that is what makes a resize a translate', () => {
    for (const sheet of SHEETS) {
      expect(artTransform(sheet)).toContain(`scale(${ART_SCALE.toFixed(5)})`);
    }
  });

  it('never lets the composition run taller than the sheet', () => {
    for (const sheet of SHEETS) expect(ART_INK_HEIGHT).toBeLessThan(sheet.h);
  });

  it('excludes a square sheet, because the composition does not fit one', () => {
    expect(SHEETS.some(s => s.h === W)).toBe(false);
    expect(ART_INK_HEIGHT).toBeGreaterThan(W);
  });

  it('covers every size the photo shop prints', () => {
    expect(SHEETS.map(s => s.id).sort()).toEqual(['11x14', '12x18', '16x20', '4x6', '8x10', 'a4']);
  });

  it('shares one layout between sizes of the same ratio', () => {
    const bySize = (id: string) => SHEETS.find(s => s.id === id)!;
    expect(artDy(bySize('8x10').h)).toBe(artDy(bySize('16x20').h));
    expect(artDy(bySize('12x18').h)).toBe(artDy(bySize('4x6').h));
  });

  it('falls back to A4 for an unknown or missing id', () => {
    expect(sheetById(null)).toBe(DEFAULT_SHEET);
    expect(sheetById('poster')).toBe(DEFAULT_SHEET);
    expect(sheetById('11x14').id).toBe('11x14');
    expect(DEFAULT_SHEET.id).toBe('a4');
  });
});
