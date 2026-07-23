// pipeline/src/cities.ts

/** Slice 1 seeds one curated city. Slice 3 appends the remaining 29 (T06) — same shape, same writer. */
export interface CuratedCity { slug: string; name: string; region: string; country: string; fixture: string; signature: string; }

export const CURATED_CITIES: CuratedCity[] = [
  { slug: 'denver', name: 'Denver', region: 'CO', country: 'United States', fixture: 'denver.json', signature: 'mile-high, big daily swing, dry' },
];
