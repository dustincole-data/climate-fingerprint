import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitName, NAME_BOX, NAME_SIZE, NAME_FLOOR } from './og.ts';
import { fitWidth } from '../src/lib/textmetrics.ts';

/** Satori breaks the name at spaces, so "does it fit" is a per-token question, not a whole-string one. */
const widestToken = (text: string, size: number) =>
  Math.max(...text.split(' ').map(t => fitWidth('serif500', t, size)));

const manifest = JSON.parse(
  await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'cities.json'), 'utf8'),
) as { name: string }[];

describe('fitName', () => {
  it('leaves every curated city at the designed size, untouched', () => {
    for (const { name } of manifest) {
      expect(fitName(name), name).toEqual({ size: NAME_SIZE, text: name });
    }
  });

  it('leaves the generic card untouched', () => {
    expect(fitName('Climate Fingerprint')).toEqual({ size: NAME_SIZE, text: 'Climate Fingerprint' });
  });

  it('shrinks a single token too wide for the column instead of clipping it', () => {
    // 648 units at the designed 62 against a 576 box — the case that printed as "Thiruvananthapura|".
    const fitted = fitName('Thiruvananthapuram');
    expect(fitted.text).toBe('Thiruvananthapuram');
    expect(fitted.size).toBeLessThan(NAME_SIZE);
    expect(widestToken(fitted.text, fitted.size)).toBeLessThanOrEqual(NAME_BOX);
  });

  it('truncates rather than dropping below the floor', () => {
    const fitted = fitName('Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch');
    expect(fitted.size).toBe(NAME_FLOOR);
    expect(fitted.text.endsWith('…')).toBe(true);
    expect(widestToken(fitted.text, fitted.size)).toBeLessThanOrEqual(NAME_BOX);
  });

  it('never lets a token exceed the column, whatever the name', () => {
    const names = [
      ...manifest.map(c => c.name),
      'Climate Fingerprint',
      'Thiruvananthapuram',
      'Dolores Hidalgo Cuna de la Independencia Nacional',
      'Bang Krathum Thiruvananthapuram Ludwigshafen',
      'W'.repeat(40),
      'Ā'.repeat(30), // outside the latin subset: UNKNOWN_ADVANCE territory
      'A',
    ];
    for (const name of names) {
      const fitted = fitName(name);
      expect(widestToken(fitted.text, fitted.size), name).toBeLessThanOrEqual(NAME_BOX);
      expect(fitted.size).toBeGreaterThanOrEqual(NAME_FLOOR);
      expect(fitted.size).toBeLessThanOrEqual(NAME_SIZE);
    }
  });
});
