import { describe, it, expect } from 'vitest';
import { tempColor } from './color';

describe('tempColor', () => {
  it('returns the exact cold-stop color at -12°C', () => {
    expect(tempColor(-12)).toBe('oklch(52.0% 0.1300 270.0)');
  });
  it('returns the exact pale-neutral pivot at 13°C', () => {
    expect(tempColor(13)).toBe('oklch(86.0% 0.0450 150.0)');
  });
  it('returns the exact hot-stop color at 34°C', () => {
    expect(tempColor(34)).toBe('oklch(60.0% 0.1850 28.0)');
  });
  it('clamps below -12°C to the cold stop', () => {
    expect(tempColor(-50)).toBe(tempColor(-12));
  });
  it('clamps above 34°C to the hot stop', () => {
    expect(tempColor(100)).toBe(tempColor(34));
  });
});
