// src/lib/slug.ts
// The URL is the only thing carried between typing a city and rendering it: a cold shared link arrives as
// a slug with no query attached, so slugify/deslugify must round-trip (T07 §2 - `reykjavik`, not `reykjavík`).

/** Lowercased, ASCII-folded, hyphenated. A query with no Latin letters at all (e.g. a CJK name) keeps its
 *  characters percent-encoded rather than collapsing to an empty, unrenderable slug. */
export function slugify(query: string): string {
  const folded = query.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return folded || encodeURIComponent(query.trim().toLowerCase());
}

/** The geocoder query behind a slug. */
export function deslugify(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch { /* a hand-mangled %-sequence: fall back to the raw slug */ }
  return decoded.replace(/-/g, ' ').trim();
}

/** Display name for the moment before the geocoder answers ("Developing San Diego's fingerprint..."). */
export function titleCase(text: string): string {
  return text.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1));
}
