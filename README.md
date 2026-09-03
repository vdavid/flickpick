# FlickPick

**Swipe. Rate. Discover your next obsession.**

A mobile-first way to work through films and series:

- **Discover** — swipe a deck of covers. Left buries a title, right parks it on your
  watchlist, up marks it as already seen. Buttons and arrow keys do the same thing.
- **Rate** — give the things you have seen 1–5 stars.
- **For You** — recommendations built from those ratings, each with the reason it
  was picked ("Christopher Nolan, like Interstellar").
- **Lists** — your watchlist, your seen list, and everything you buried.

## Status

This is the **demo stage**: a static SvelteKit app with no backend. Everything
lives in `localStorage` on the device you are using, and the catalog is a curated
seed list of 115 titles that ships in the repo.

The planned production shape is a Go API with Postgres and Google sign-in behind
`flickpick.veszelovszki.com`, so each person sees only their own lists. See
[Roadmap](#roadmap).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Other scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Static build into `build/` |
| `npm run preview` | Serve that build locally |
| `npm run check` | Type-check and lint the Svelte components |
| `npm run enrich` | Fetch posters from OMDb into the catalog (needs a key) |

## Posters (OMDb)

The catalog ships without poster URLs, and the app draws its own cover art in the
meantime — deterministic per title, so it looks intentional rather than broken.

To get real posters, [grab a free OMDb key](https://www.omdbapi.com/apikey.aspx) and:

```bash
cp .env.example .env      # put the key in OMDB_API_KEY
OMDB_API_KEY=xxxxxxx npm run enrich
```

That resolves every seed title by name and writes `poster`, `imdbId`, `imdbRating`
and `runtime` back into `src/lib/data/catalog.json`. Titles it cannot match are
printed at the end; give those an `"omdbQuery"` field in the catalog and rerun.

**The key is a build-time secret and never reaches the browser** — what ships is the
resulting JSON. In CI the same thing happens from the `OMDB_API_KEY` repository
secret, so you can also just set the secret and let the deploy do it.

OMDb has no browse or discover endpoint, only lookup by title or IMDb id. That is
why the deck is seeded from a curated list in the repo rather than pulled live.

## Deployment

Pushing to `main` (or the current demo branch) builds the app and publishes it to
GitHub Pages via `.github/workflows/deploy-pages.yml`.

The workflow enables Pages itself on its first successful run (`enablement: true`
on `actions/configure-pages`), so there is no manual setup. If that step is ever
rejected because the token cannot change repository settings, turn it on by hand
under **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Optional: add a repository secret named `OMDB_API_KEY` under **Settings → Secrets
and variables → Actions**. With it set, the deploy bakes in real posters.

The demo then lives at `https://<owner>.github.io/flickpick/`. The workflow passes
`BASE_PATH=/flickpick` so all links and assets resolve under that subpath.

## How the recommendations work

Everything is content-based and runs in the browser — no model, no server, and it
works from a handful of ratings.

1. Each library entry gets a weight: a 5★ rating is `+1`, 3★ is `0`, 1★ is `-1`,
   a watchlist swipe `+0.5`, a plain "seen" `+0.3`, a dismissal `-0.6`.
2. That weight is spread across the title's features: each genre, the director,
   each of the top-billed cast, the decade, and the type.
3. Features are damped by how common they are in the catalog, so sharing a
   director says far more than both being a Drama.
4. Candidates are scored by summing the features they match, normalised for how
   many features they have, plus a small popularity prior so a cold profile still
   orders sensibly.

The Discover deck is ranked the same way, so the further you swipe the more the
deck bends toward your taste. It re-ranks in batches of 24 rather than after every
swipe, so the cards behind the top one do not jump around.

## Layout

```
src/lib/data/catalog.json    the seed catalog (115 titles)
src/lib/library.svelte.ts    the user's library — the one module a backend would replace
src/lib/recommend.ts         taste profile and scoring
src/lib/components/          SwipeCard, Poster, TitleRow, StarRating, TabBar
src/routes/                  Discover (/), Rate, Lists, For You
scripts/enrich-catalog.mjs   OMDb poster fetcher
```

## Roadmap

The demo deliberately stops short of the full product. What is still to build:

- **Go API + Postgres** — move the library server-side so it follows you between
  devices. `src/lib/library.svelte.ts` is the only module that has to change.
- **Google sign-in** — OAuth against Google, sessions in an httpOnly cookie, every
  row scoped to a user id.
- **Hetzner deployment** — Docker Compose (app + Postgres + Caddy for TLS) behind
  `flickpick.veszelovszki.com`, deployed over SSH from GitHub Actions.
- **A live catalog** — OMDb resolves titles but cannot browse them, so a bigger
  catalog needs either a much longer seed list or a source with a discover endpoint.
