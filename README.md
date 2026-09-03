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
lives in `localStorage` on the device you are using.

The planned production shape is a Go API with Postgres and Google sign-in behind
`flickpick.veszelovszki.com`, so each person sees only their own lists. See
[Roadmap](#roadmap).

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run build` | Static build into `build/` |
| `npm run preview` | Serve that build locally |
| `npm run check` | Type-check and lint the Svelte components |
| `npm run catalog` | Rebuild `static/catalog.json` from TMDB (needs a key) |

## The catalog

`static/catalog.json` is committed, so the app runs with no network beyond
poster images and ordinary pushes deploy in seconds. `scripts/build-catalog.mjs`
regenerates it from TMDB:

```bash
TMDB_READ_ACCESS_TOKEN=... npm run catalog
CATALOG_MOVIES=6000 CATALOG_SERIES=2000 npm run catalog   # tune the size
```

It pulls the most-voted films and series from `/discover` (vote count is a far
better popularity proxy than vote average, which floats obscure titles with nine
10/10 votes to the top), then fetches each one's details and credits so the
recommender has directors and cast to work with.

A third pass joins IMDb's own ratings on, shown on the Rate screen. TMDB hands us
each title's IMDb id and IMDb publishes ratings as a bulk dataset, so this needs
one download and no extra per-title requests. It is best-effort: if the download
fails the build carries on without IMDb scores. Note that **IMDb licenses that
dataset for non-commercial use only** — set `CATALOG_SKIP_IMDB=1` to leave it
out.

The file interns genre and person names into shared tables and refers to them by
index, which roughly halves the payload. The app fetches it at runtime rather
than bundling it, so the shell paints before the catalog arrives.

CI rebuilds it on a weekly schedule, or on a manual run with **Rebuild catalog
from TMDB** ticked, and commits the result. The TMDB credentials are build-time
only — what ships to the browser is the JSON.

### Why not OMDb

OMDb can only look a title up by IMDb id or by name, plus a keyword search over
titles. It has no genre filter, no sort by rating or popularity, no person
search, no "similar titles" endpoint, and the free key allows 1,000 requests a
day. It cannot power a discovery feed. TMDB's `/discover` does exactly that, and
serves posters from a free CDN.

## How the recommendations work

Everything is content-based and runs in the browser — no server, no shared data,
and it works from a handful of ratings.

**The signals.** Each library entry carries a weight: a 10/10 rating is `+1`,
5-6 is around `0`, 1/10 is `-1`, a watchlist swipe `+0.5`, a plain "seen" `+0.25`.
A left swipe is only `-0.35`, because it usually means "not tonight"; the **Never
again** button on the swipe bar turns it into a real `-1.2` veto. Swiping down
skips a title at weight `0` — explicitly no opinion.

**The features.** Each weight spreads across the title's genres, directors,
top-billed cast and decade, damped by how common each feature is across the whole
catalog — sharing a director says far more than both being a Drama.

**The learned part.** Those four groups are scored separately, and a small
logistic regression fitted on the user's own swipes decides how much each group
should count. Someone who follows directors and someone who follows actors get
genuinely different rankings. Each training example is scored against a profile
with that example *removed*, so the fit is judged on generalisation rather than on
recall, and the learned weights are blended toward sensible defaults until there
are about forty examples to go on.

**The deck.** Pure greedy ranking collapses into one director within a dozen
swipes, so the picker also:

- samples from the best few candidates rather than always taking the top one,
- applies maximal marginal relevance, penalising a card that echoes what is
  already in the deck,
- reserves about a fifth of the deck for **wildcards** drawn from outside the
  shortlist entirely (restricted to the better half by rating, so "different"
  never means "bad"). These are badged *Something different*.

A Bayesian-shrunk quality prior from TMDB's vote average and count keeps a 9.8
with 210 votes from outranking an 8.6 with 30,000, and gives a cold profile a
sensible order to start from.

New users get a "which of these did you love?" grid instead of swiping blind, so
the model starts with real positives rather than only learning from rejections.
Those answers go in as **provisional 10s**: they steer the picks immediately, but
the titles stay on the Rate list until the user gives them a real score, because
"I loved this" is not the same as "this is a ten".

## Layout

```
static/catalog.json          the catalog, fetched at runtime
scripts/build-catalog.mjs    TMDB -> catalog.json
src/lib/catalog.svelte.ts    loading, unpacking, and the feature index
src/lib/taste.ts             taste profile, the learned weights, explanations
src/lib/deck.ts              exploration, diversity, wildcards
scripts/lib/imdb-ratings.mjs joins IMDb's ratings dump onto the catalog
src/lib/library.svelte.ts    the user's library — the one module a backend would replace
src/lib/components/          SwipeCard, Poster, TitleRow, StarRating, TabBar, Onboarding
src/routes/                  Discover (/), Rate, Lists, For You
```

## Roadmap

The demo deliberately stops short of the full product. What is still to build:

- **Go API + Postgres** — move the library server-side so it follows you between
  devices. `src/lib/library.svelte.ts` is the only module that has to change.
- **Google sign-in** — OAuth against Google, sessions in an httpOnly cookie, every
  row scoped to a user id.
- **Hetzner deployment** — Docker Compose (app + Postgres + Caddy for TLS) behind
  `flickpick.veszelovszki.com`, deployed over SSH from GitHub Actions.
- **Collaborative filtering** — "people who liked this also liked" needs many
  users, so it only becomes possible once the app has real traffic. Until then
  the content-based model is the right tool.

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
