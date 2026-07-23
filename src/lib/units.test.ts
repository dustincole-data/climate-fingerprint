import { describe, it, expect } from 'vitest';
import { cToF, mmToIn } from './units';

describe('units', () => {
  it('converts 0°C to 32°F', () => { expect(cToF(0)).toBe(32); });
  it('converts 100°C to 212°F', () => { expect(cToF(100)).toBe(212); });
  it('converts 25.4mm to 1 inch', () => { expect(mmToIn(25.4)).toBeCloseTo(1, 10); });
});
