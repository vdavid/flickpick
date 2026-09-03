#!/usr/bin/env node
/**
 * Builds static/catalog.json from TMDB.
 *
 *   TMDB_READ_ACCESS_TOKEN=... npm run catalog
 *   TMDB_API_KEY=... npm run catalog            # v3 key also works
 *
 * Two passes. The first walks /discover sorted by vote count, which already
 * carries titles, overviews, posters, years, genre ids and vote counts —
 * everything except credits. The second fetches credits for each title.
 *
 * The split matters when something goes wrong: if the second pass runs out of
 * time, the catalog is still complete and only loses cast and director on the
 * titles it did not reach, instead of losing everything.
 *
 * Size knobs: CATALOG_MOVIES, CATALOG_SERIES, and CATALOG_CREDITS to cap how
 * many titles get credits (default: all of them).
 *
 * Nothing here runs in the browser: the key is a build-time secret, and what
 * ships is the JSON.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'catalog.json');
// Overviews are over half the payload and are not needed to rank anything, so they
// ship separately and load in the background once the app is already usable.
const OUT_BLURBS = join(ROOT, 'static', 'blurbs.json');

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;
const WANT_MOVIES = Number(process.env.CATALOG_MOVIES ?? 6000);
const WANT_SERIES = Number(process.env.CATALOG_SERIES ?? 2000);
const WANT_CREDITS = Number(process.env.CATALOG_CREDITS ?? Number.POSITIVE_INFINITY);

/** TMDB refuses discover pages past 500, so 10k per query is the hard ceiling. */
const MAX_PAGE = 500;
const PER_PAGE = 20;
const CONCURRENCY = 16;
/** A ceiling, not a brake: measured runs sit around 45/s without being throttled,
 *  so this only bites if TMDB gets slower. */
const REQUESTS_PER_SECOND = 45;
/** No single request may wedge a worker. */
const REQUEST_TIMEOUT_MS = 15000;
/** However long TMDB asks us to wait, never sit idle longer than this. */
const MAX_RETRY_AFTER_S = 10;
/** Write out whatever we have rather than running forever. */
const DEADLINE_MS = Number(process.env.CATALOG_DEADLINE_MS ?? 18 * 60 * 1000);
/** Below this many votes a title is too obscure to be worth a swipe. */
const MIN_VOTES = 200;
const CAST_KEPT = 4;

if (!TOKEN && !API_KEY) {
	console.error('Set TMDB_READ_ACCESS_TOKEN (preferred) or TMDB_API_KEY.');
	process.exit(1);
}

const started = Date.now();
const elapsed = () => Math.round((Date.now() - started) / 1000);
const overDeadline = () => Date.now() - started > DEADLINE_MS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let requests = 0;
let throttled = 0;
let failures = 0;

/** Simple spacing limiter: hand out slots no faster than REQUESTS_PER_SECOND. */
let nextSlot = 0;
async function slot() {
	const gap = 1000 / REQUESTS_PER_SECOND;
	const now = Date.now();
	nextSlot = Math.max(now, nextSlot) + gap;
	const wait = nextSlot - gap - now;
	if (wait > 0) await sleep(wait);
}

async function tmdb(path, params = {}) {
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	url.searchParams.set('language', 'en-US');
	for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
	if (!TOKEN) url.searchParams.set('api_key', API_KEY);

	const headers = { accept: 'application/json' };
	if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

	for (let attempt = 0; attempt < 4; attempt++) {
		await slot();
		let res;
		try {
			res = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
		} catch (error) {
			if (attempt === 3) throw error;
			await sleep(300 * 2 ** attempt);
			continue;
		}
		requests++;

		if (res.status === 429) {
			throttled++;
			const asked = Number(res.headers.get('retry-after') ?? 1);
			await sleep((Math.min(asked, MAX_RETRY_AFTER_S) + 0.5) * 1000);
			continue;
		}
		if (res.status === 401) throw new Error('TMDB rejected the credentials (401).');
		if (res.status === 404) return null;
		if (!res.ok) {
			if (attempt === 3) throw new Error(`TMDB ${res.status} for ${path}`);
			await sleep(300 * 2 ** attempt);
			continue;
		}
		return res.json();
	}
	throw new Error(`TMDB gave up on ${path}`);
}

/** Run `task` over `items` with a fixed pool of workers. Individual failures are
 *  counted and skipped: one bad title must not lose the whole build. */
async function pooled(items, task, label) {
	const queue = [...items];
	const results = [];
	let done = 0;

	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (;;) {
				const item = queue.shift();
				if (item === undefined) return;
				if (overDeadline()) return;
				try {
					const value = await task(item);
					if (value !== null && value !== undefined) results.push(value);
				} catch {
					failures++;
				}
				done++;
				if (done % 100 === 0) {
					console.log(`  ${label}: ${done}/${items.length} (${elapsed()}s, ${throttled} throttled)`);
				}
			}
		})
	);
	return results;
}

async function genreNames(kind) {
	const data = await tmdb(`/genre/${kind === 'movie' ? 'movie' : 'tv'}/list`);
	return new Map((data?.genres ?? []).map((g) => [g.id, g.name]));
}

function year(value) {
	const parsed = Number.parseInt(String(value ?? '').slice(0, 4), 10);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Pass one: everything discover already knows. */
async function discover(kind, want, genres) {
	if (want <= 0) return [];
	const pages = Math.min(MAX_PAGE, Math.ceil(want / PER_PAGE));
	const path = kind === 'movie' ? '/discover/movie' : '/discover/tv';
	console.log(`Discovering ${want} ${kind === 'movie' ? 'films' : 'series'} over ${pages} pages...`);

	const batches = await pooled(
		Array.from({ length: pages }, (_, i) => i + 1),
		async (page) => {
			const data = await tmdb(path, {
				page,
				sort_by: 'vote_count.desc',
				'vote_count.gte': MIN_VOTES,
				include_adult: false,
				...(kind === 'movie' ? { include_video: false } : {})
			});
			return data?.results ?? [];
		},
		`${kind} pages`
	);

	const seen = new Set();
	const rows = [];
	for (const batch of batches) {
		for (const r of batch) {
			const name = kind === 'movie' ? r.title : r.name;
			const start = year(kind === 'movie' ? r.release_date : r.first_air_date);
			const names = (r.genre_ids ?? []).map((id) => genres.get(id)).filter(Boolean);
			if (!name || !start || names.length === 0 || seen.has(r.id)) continue;
			seen.add(r.id);
			rows.push({
				tmdbId: r.id,
				kind,
				i: (kind === 'movie' ? 'm' : 't') + r.id,
				n: name,
				y: start,
				k: kind === 'movie' ? 0 : 1,
				genreNames: names,
				directorNames: [],
				castNames: [],
				p: r.poster_path ?? null,
				o: (r.overview ?? '').trim(),
				r: Math.round((r.vote_average ?? 0) * 10) / 10,
				v: r.vote_count ?? 0
			});
		}
	}
	console.log(`  kept ${rows.length} (${elapsed()}s)`);
	return rows.slice(0, want);
}

/** Pass two: credits, and for series the creators and end year, for the top slice. */
async function addCredits(rows) {
	const target = Number.isFinite(WANT_CREDITS) ? rows.slice(0, WANT_CREDITS) : rows;
	if (target.length === 0) return;
	console.log(`Fetching credits for ${target.length} titles...`);

	await pooled(
		target,
		async (row) => {
			const detail = await tmdb(`/${row.kind === 'movie' ? 'movie' : 'tv'}/${row.tmdbId}`, {
				append_to_response: 'credits'
			});
			if (!detail) return null;

			row.castNames = (detail.credits?.cast ?? [])
				.slice()
				.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
				.slice(0, CAST_KEPT)
				.map((c) => c.name)
				.filter(Boolean);

			if (row.kind === 'series') {
				row.directorNames = (detail.created_by ?? []).map((p) => p.name).filter(Boolean);
				const end = year(detail.last_air_date);
				// Only claim an end year for a show TMDB says is finished.
				if (end && detail.status && detail.status !== 'Returning Series') row.e = end;
			} else {
				row.directorNames = (detail.credits?.crew ?? [])
					.filter((c) => c.job === 'Director')
					.map((c) => c.name)
					.filter(Boolean);
			}
			return row;
		},
		'credits'
	);
	console.log(`  done (${elapsed()}s)`);
}

const [movieGenres, tvGenres] = await Promise.all([genreNames('movie'), genreNames('tv')]);

const rows = [
	...(await discover('movie', WANT_MOVIES, movieGenres)),
	...(await discover('series', WANT_SERIES, tvGenres))
].sort((a, b) => b.v - a.v);

await addCredits(rows);

if (rows.length === 0) {
	console.error('TMDB returned nothing usable; leaving the existing catalog alone.');
	process.exit(1);
}

// Intern the strings that repeat across thousands of rows.
const genres = [];
const people = [];
const genreIndex = new Map();
const personIndex = new Map();
const intern = (table, index, value) => {
	let at = index.get(value);
	if (at === undefined) {
		at = table.length;
		table.push(value);
		index.set(value, at);
	}
	return at;
};

const titles = rows.map((t) => ({
	i: t.i,
	n: t.n,
	y: t.y,
	...(t.e ? { e: t.e } : {}),
	k: t.k,
	g: t.genreNames.map((g) => intern(genres, genreIndex, g)),
	d: t.directorNames.slice(0, 2).map((p) => intern(people, personIndex, p)),
	c: t.castNames.map((p) => intern(people, personIndex, p)),
	p: t.p,
	r: t.r,
	v: t.v
}));

const blurbs = Object.fromEntries(rows.filter((t) => t.o).map((t) => [t.i, t.o]));

const catalog = {
	version: 2,
	generatedAt: new Date().toISOString(),
	source: 'TMDB',
	genres,
	people,
	titles
};

await mkdir(dirname(OUT), { recursive: true });
const json = JSON.stringify(catalog);
await writeFile(OUT, json);
const blurbJson = JSON.stringify(blurbs);
await writeFile(OUT_BLURBS, blurbJson);

console.log(
	`\nWrote ${titles.length} titles (${titles.filter((t) => t.k === 0).length} films, ` +
		`${titles.filter((t) => t.k === 1).length} series), ${genres.length} genres, ` +
		`${people.length} people.`
);
console.log(
	`catalog.json ${(Buffer.byteLength(json) / 1024 / 1024).toFixed(2)} MB, ` +
		`blurbs.json ${(Buffer.byteLength(blurbJson) / 1024 / 1024).toFixed(2)} MB, ` +
		`${titles.filter((t) => t.p).length} with posters, ${titles.filter((t) => t.c.length).length} with cast.`
);
console.log(
	`${requests} TMDB requests in ${elapsed()}s (${throttled} throttled, ${failures} failed)` +
		(overDeadline() ? ' — stopped at the deadline.' : '.')
);
