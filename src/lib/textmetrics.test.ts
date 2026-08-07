import { describe, it, expect } from 'vitest';
import { advanceWidth, fitWidth, SAFETY, UNKNOWN_ADVANCE } from './textmetrics';

describe('advanceWidth', () => {
  // Locked against the browser's own SVG getComputedTextLength() at the time the tables were generated.
  // If a font is upgraded these move; regenerate with scripts/textmetrics.mjs and re-validate.
  const CASES: [Parameters<typeof advanceWidth>[0], string, number, number, number][] = [
    // face, text, size, letterSpacing, measured width in the browser
    ['serif500', 'San Francisco', 58, 0, 391.05],
    ['serif500', 'Fairbanks', 58, 0, 280.84],
    ['serif500', 'Denver', 58, 0, 200.58],
    ['sans400', 'savage cold, endless-summer-light swing', 15.5, 0, 287.09],
    ['sans400', 'gray, wet, mild', 15.5, 0, 101.03],
    ['sans600', 'UNITED STATES', 14.5, 3, 146.81],
  ];

  it.each(CASES)('%s "%s" is within 2.5%% of the browser', (face, text, size, ls, measured) => {
    const predicted = advanceWidth(face, text, size, ls);
    expect(Math.abs(predicted - measured) / measured).toBeLessThan(0.025);
  });

  it('never under-reads by more than the safety factor covers', () => {
    for (const [face, text, size, ls, measured] of CASES) {
      expect(fitWidth(face, text, size, ls)).toBeGreaterThanOrEqual(measured);
    }
  });

  it('scales linearly with size and counts letter-spacing per character', () => {
    expect(advanceWidth('sans400', 'abc', 20)).toBeCloseTo(advanceWidth('sans400', 'abc', 10) * 2, 6);
    expect(advanceWidth('sans400', 'abc', 10, 2) - advanceWidth('sans400', 'abc', 10)).toBeCloseTo(6, 6);
  });

  it('treats an unmeasured character as a full em, so exotic names shrink rather than spill', () => {
    expect(advanceWidth('serif500', '中', 10)).toBeCloseTo(10 * UNKNOWN_ADVANCE, 6);
  });

  it('gives the space a real width — a zero here is the whitespace-collapse trap', () => {
    for (const face of ['serif500', 'sans400', 'sans600'] as const) {
      expect(advanceWidth(face, ' ', 100)).toBeGreaterThan(20);
    }
  });

  it('applies SAFETY and nothing else', () => {
    expect(fitWidth('sans400', 'hello', 12)).toBeCloseTo(advanceWidth('sans400', 'hello', 12) * SAFETY, 9);
  });
});
