import { describe, it, expect } from 'vitest';
import { slugify, deslugify, titleCase } from './slug';

describe('slugify', () => {
  it('ASCII-folds accents so a typed city matches its curated slug', () => {
    expect(slugify('Reykjavík')).toBe('reykjavik');
    expect(slugify('São Paulo')).toBe('sao-paulo');
  });
  it('lowercases and hyphenates multi-word names', () => {
    expect(slugify('New York')).toBe('new-york');
    expect(slugify('  St. Louis ')).toBe('st-louis');
  });
  it('never emits an empty slug for a non-Latin query', () => {
    expect(slugify('東京').length).toBeGreaterThan(0);
  });
});

describe('deslugify', () => {
  it('round-trips a slug back into a geocodable query', () => {
    expect(deslugify(slugify('San Francisco'))).toBe('san francisco');
    expect(deslugify(slugify('東京'))).toBe('東京');
  });
  it('survives a hand-mangled percent sequence', () => {
    expect(deslugify('100%')).toBe('100%');
  });
});

describe('titleCase', () => {
  it('capitalizes each word of a deslugified query', () => {
    expect(titleCase('san diego')).toBe('San Diego');
  });
});
