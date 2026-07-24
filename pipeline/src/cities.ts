// pipeline/src/cities.ts

/** Slice 2 seeds the 4 T02 fixture cities (the gallery-wall demo set); slice 3 appends the remaining 26 (T06) — same shape, same writer. */
export interface CuratedCity { slug: string; name: string; region: string; country: string; fixture: string; signature: string; }

/** Array order IS the gallery-wall order (T05 §gallery: max-contrast, fixed). Cold-wet · hot-wet · cool-dry · southern-flip. */
export const CURATED_CITIES: CuratedCity[] = [
  { slug: 'reykjavik', name: 'Reykjavík', region: '', country: 'Iceland', fixture: 'reykjavik.json', signature: 'cold, wet, low-drama, never warm' },
  { slug: 'singapore', name: 'Singapore', region: '', country: 'Singapore', fixture: 'singapore.json', signature: 'seasonless, hot, wet daily' },
  { slug: 'denver', name: 'Denver', region: 'CO', country: 'United States', fixture: 'denver.json', signature: 'mile-high, big daily swing, dry' },
  { slug: 'melbourne', name: 'Melbourne', region: 'VIC', country: 'Australia', fixture: 'melbourne.json', signature: 'flipped seasons' },
];
