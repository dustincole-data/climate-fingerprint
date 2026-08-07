import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fitCenterBlock, R_FIT, type BlockText, type FittedBlock, type SlotName } from './fit';
import { fitWidth, type Face } from './textmetrics';

const SLOTS: { key: SlotName; face: Face; letterSpacing: number; design: number }[] = [
  { key: 'name', face: 'serif500', letterSpacing: 0, design: 58 },
  { key: 'country', face: 'sans600', letterSpacing: 3, design: 14.5 },
  { key: 'signature', face: 'sans400', letterSpacing: 0, design: 15.5 },
  { key: 'readout', face: 'sans400', letterSpacing: 0, design: 13.5 },
];

/** The em box fit.ts reserves. Duplicated on purpose: the test asserts the contract, not the implementation. */
const ASCENT = 0.76, DESCENT = 0.24;

/**
 * Furthest any glyph of the block gets from the disc centre, treating each line as a rectangle
 * (width × its reserved em box) centred on x. This is the number that must never exceed R_FIT.
 */
function reach(block: FittedBlock): number {
  let worst = 0;
  for (const { key, face, letterSpacing } of SLOTS) {
    const { size, lines } = block[key];
    for (const line of lines) {
      const halfWidth = fitWidth(face, line.text, size, letterSpacing) / 2;
      const top = line.y - ASCENT * size, bottom = line.y + DESCENT * size;
      const dy = Math.max(Math.abs(top), Math.abs(bottom));
      worst = Math.max(worst, Math.hypot(halfWidth, dy));
    }
  }
  return worst;
}

const CURATED: BlockText[] = JSON.parse(
  await readFile(new URL('../../public/data/cities.json', import.meta.url), 'utf8'),
).map((c: { name: string; country: string; signature: string }) => ({
  name: c.name,
  country: c.country.toUpperCase(),
  signature: c.signature,
  readout: '100°F avg · 103.9 in/yr', // the widest shape the generated readout takes
}));

const STRESS: BlockText[] = [
  { name: 'Thiruvananthapuram', country: 'INDIA', signature: 'hot, hard monsoon, never cold', readout: '84°F avg · 71.2 in/yr' },
  { name: 'Îles-de-la-Madeleine', country: 'CANADA', signature: 'maritime, wind-scoured, long winter', readout: '41°F avg · 40.1 in/yr' },
  { name: 'Ouagadougou', country: 'BURKINA FASO', signature: 'Sahel furnace, one short wet season', readout: '84°F avg · 30.0 in/yr' },
  { name: 'Nizhny Novgorod', country: 'RUSSIAN FEDERATION', signature: 'hard continental winter', readout: '40°F avg · 24.0 in/yr' },
  { name: 'Winston-Salem', country: 'UNITED STATES', signature: 'humid subtropical, four soft seasons', readout: '59°F avg · 45.0 in/yr' },
  { name: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch', country: 'UNITED KINGDOM', signature: 'wet, mild, windy', readout: '50°F avg · 50.0 in/yr' },
  { name: '東京', country: 'JAPAN', signature: 'humid summer, dry winter', readout: '60°F avg · 60.0 in/yr' },
  { name: 'X', country: '', signature: '', readout: '60°F avg · 60.0 in/yr' },
];

describe('fitCenterBlock', () => {
  it.each([...CURATED, ...STRESS].map(t => [t.name, t] as const))(
    'keeps every glyph of %s inside the ring',
    (_name, text) => {
      expect(reach(fitCenterBlock(text))).toBeLessThanOrEqual(R_FIT);
    },
  );

  it('leaves a city that already fits at its designed sizes', () => {
    const block = fitCenterBlock({ name: 'Denver', country: 'UNITED STATES', signature: 'mile-high, big daily swing, dry', readout: '50°F avg · 15.9 in/yr' });
    expect(block.name.size).toBe(58);
    expect(block.country.size).toBe(14.5);
    expect(block.signature.size).toBe(15.5);
    expect(block.readout.size).toBe(13.5);
    expect(block.name.lines).toHaveLength(1);
    expect(block.signature.lines).toHaveLength(1);
  });

  it('shrinks the name that used to cross the ring, and only the name', () => {
    const block = fitCenterBlock({ name: 'San Francisco', country: 'UNITED STATES', signature: 'cool, foggy, dry summer', readout: '56°F avg · 19.2 in/yr' });
    expect(block.name.size).toBeLessThan(45);
    expect(block.name.size).toBeGreaterThan(34);
    expect(block.name.lines).toHaveLength(1);
    expect(block.signature.size).toBe(15.5);
    expect(block.country.size).toBe(14.5);
  });

  it('never sets a slot above its designed size', () => {
    for (const text of [...CURATED, ...STRESS]) {
      const block = fitCenterBlock(text);
      for (const { key, design } of SLOTS) expect(block[key].size).toBeLessThanOrEqual(design);
    }
  });

  it('drops a slot with no text instead of leaving a gap', () => {
    const block = fitCenterBlock({ name: 'Reno', country: '', signature: '', readout: '52°F avg · 7.4 in/yr' });
    expect(block.country.lines).toHaveLength(0);
    expect(block.signature.lines).toHaveLength(0);
    expect(block.name.lines).toHaveLength(1);
    expect(block.readout.lines).toHaveLength(1);
  });

  it('wraps only when shrinking to the floor is not enough', () => {
    // Every curated city clears the 34 floor on one line, so none of them may wrap.
    for (const text of CURATED) {
      const block = fitCenterBlock(text);
      expect(block.name.lines).toHaveLength(1);
    }
  });

  it('truncates an unbreakable token rather than letting it out of the disc', () => {
    const block = fitCenterBlock({ name: 'Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch', country: 'UNITED KINGDOM', signature: 'wet, mild, windy', readout: '50°F avg · 50.0 in/yr' });
    expect(block.name.lines[0].text.endsWith('…')).toBe(true);
    expect(reach(block)).toBeLessThanOrEqual(R_FIT);
  });

  it('is deterministic — the build and the browser must draw the same poster', () => {
    for (const text of [...CURATED, ...STRESS]) {
      expect(JSON.stringify(fitCenterBlock(text))).toBe(JSON.stringify(fitCenterBlock(text)));
    }
  });

  it('puts an unfitted block back on the baselines the poster shipped with', () => {
    const block = fitCenterBlock({ name: 'Denver', country: 'UNITED STATES', signature: 'mile-high, big daily swing, dry', readout: '50°F avg · 15.9 in/yr' });
    const SHIPPED: [SlotName, number][] = [['name', -12], ['country', 16], ['signature', 50], ['readout', 80]];
    for (const [key, y] of SHIPPED) {
      expect(Math.abs(block[key].lines[0].y - y)).toBeLessThan(0.15);
    }
  });
});
