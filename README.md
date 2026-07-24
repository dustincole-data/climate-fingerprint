# Climate Fingerprint

A free, static poster of any city's typical year. One radial mark carries the whole
year: angle = day (January at the top, clockwise), radius + color = temperature,
band thickness = the daily low-to-high swing, inner ring = rainfall. 30 curated
cities on a gallery wall; type any other city and it computes in your browser.

Data: 1991–2020 day-of-year normals from ERA5, served by Open-Meteo (free, no key).
It is a portrait of a normal year, not an argument about change over time.

Lives at **climatefingerprint.dustincoledata.com** (its own standalone Vercel project,
not proxied through the main dustincoledata site).

## Stack
Astro 5 (static, `base: '/'`) · TypeScript · Vitest · inline SVG posters ·
`d3-shape` for arc geometry (pure math, no d3-selection) · satori + @resvg/resvg-js
for build-time share cards. No serverless functions — 100% static.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Local dev server (Astro). Use this for local iteration. |
| `npm run data` | Build `public/data/*.json` (30 cities + the shared domain) from the committed fixtures. Gitignored output. |
| `npm run og` | Render `public/og/*.png` share cards (30 cities + `_default`). Gitignored output. |
| `npm run build` | `astro build` → `dist/…` |
| `npm test` | Vitest (normals, geometry, color, slug, units, poster). |

`public/data/` and `public/og/` are **gitignored and CI-generated** — the Vercel build
command regenerates them (`vercel.json` → `npm run data && npm run og && npm run build`).

**CI never calls Open-Meteo.** Each curated city's 1991–2020 normals are frozen in
`pipeline/fixtures/` and committed. A cold build can't finish 30 weight-heavy 30-year
archive calls inside Open-Meteo's hourly cap, and normals for a closed window never
change. Only a city with no fixture yet is fetched once (spaced, with 429 backoff) and
frozen for commit.

> **Local preview:** use `npm run dev`. `astro preview` also works (base is `/`,
> output is the default `dist/`).

## Deploy (standalone Vercel project)

**1. Vercel project**
- Import this repo as a **new** Vercel project.
- Build/output are codified in `vercel.json` (`buildCommand`, `outputDirectory: dist`).
- **Set the project's Node.js version to 22.x** (the pipeline runs `.ts` via
  `node --experimental-strip-types`, which needs Node ≥22.6).

**2. Attach the subdomain**
- Project → Settings → Domains, add `climatefingerprint.dustincoledata.com`.
- Add the CNAME Vercel shows for `climatefingerprint` at the dustincoledata.com DNS
  provider. Independent of the main site's project.

**3. Verify on the live domain**
- `/` (the 30-tile wall, tiles legible, hover phrase)
- `/city/denver` (prerendered poster, export row, OG meta present)
- `/city/louisville` then type a non-curated city (client geocode + compute, skeleton bloom)
- `/city/notacity` (not-found state)
- `/about` (method page)
- OG: `/og/denver.png` resolves; paste a city link into a social-card debugger.
- Controls: °F/°C and dark/light both persist across a reload.

## Long-tail routing
The `vercel.json` rewrite sends any `/city/<slug>` with no prerendered page to
`/404.html`, the shared client-render shell — so a typed city returns 200 instead of
404. Vercel checks the filesystem before rewrites, so the 30 prerendered pages are
unaffected.
