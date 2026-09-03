#!/usr/bin/env node
/**
 * Builds static/catalog.json from TMDB.
 *
 *   TMDB_READ_ACCESS_TOKEN=... npm run catalog
 *   TMDB_API_KEY=... npm run catalog            # v3 key also works
 *
 * Pulls the most-voted films and series (TMDB's discover endpoint sorts by
 * vote_count, which is a far better popularity proxy than vote_average — the
 * latter puts obscure titles with nine 10/10 votes on top), then fetches each
 * title's details and credits so the recommender has directors and cast.
 *
 * Tune the size with CATALOG_MOVIES / CATALOG_SERIES.
 *
 * Nothing here runs in the browser: the key is a build-time secret and what
 * ships is the JSON.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'static', 'catalog.json');

const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const API_KEY = process.env.TMDB_API_KEY;
const WANT_MOVIES = Number(process.env.CATALOG_MOVIES ?? 6000);
const WANT_SERIES = Number(process.env.CATALOG_SERIES ?? 2000);

/** TMDB refuses discover pages past 500, so 10k per query is the hard ceiling. */
const MAX_PAGE = 500;
const PER_PAGE = 20;
const CONCURRENCY = 16;
/** Below this many votes a title is too obscure to be worth a swipe. */
const MIN_VOTES = 200;
const CAST_KEPT = 4;

if (!TOKEN && !API_KEY) {
	console.error('Set TMDB_READ_ACCESS_TOKEN (preferred) or TMDB_API_KEY.');
	process.exit(1);
}

let requests = 0;

async function tmdb(path, params = {}) {
	const url = new URL(`https://api.themoviedb.org/3${path}`);
	url.searchParams.set('language', 'en-US');
	for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
	if (!TOKEN) url.searchParams.set('api_key', API_KEY);

	const headers = { accept: 'application/json' };
	if (TOKEN) headers.authorization = `Bearer ${TOKEN}`;

	for (let attempt = 0; attempt < 5; attempt++) {
		let res;
		try {
			res = await fetch(url, { headers });
		} catch (error) {
			if (attempt === 4) throw error;
			await sleep(400 * 2 ** attempt);
			continue;
		}
		requests++;

		if (res.status === 429) {
			// TMDB tells us how long to hold off; default to a second if it doesn't.
			const wait = Number(res.headers.get('retry-after') ?? 1);
			await sleep((wait + 0.5) * 1000);
			continue;
		}
		if (res.status === 401) throw new Error('TMDB rejected the credentials (401).');
		if (res.status === 404) return null;
		if (!res.ok) {
			if (attempt === 4) throw new Error(`TMDB ${res.status} for ${path}`);
			await sleep(400 * 2 ** attempt);
			continue;
		}
		return res.json();
	}
	throw new Error(`TMDB gave up on ${path}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run `task` over `items` with a fixed number of workers, in order-independent fashion. */
async function pooled(items, task, onProgress) {
	const queue = [...items];
	let done = 0;
	const results = [];
	await Promise.all(
		Array.from({ length: CONCURRENCY }, async () => {
			for (;;) {
				const item = queue.shift();
				if (item === undefined) return;
				const value = await task(item);
				if (value !== null && value !== undefined) results.push(value);
				done++;
				if (onProgress && done % 250 === 0) onProgress(done);
			}
		})
	);
	return results;
}

async function discoverIds(kind, want) {
	const pages = Math.min(MAX_PAGE, Math.ceil(want / PER_PAGE));
	const path = kind === 'movie' ? '/discover/movie' : '/discover/tv';
	const ids = [];

	console.log(`Discovering ${want} ${kind === 'movie' ? 'films' : 'series'} (${pages} pages)...`);
	const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);

	const batches = await pooled(pageNumbers, async (page) => {
		const data = await tmdb(path, {
			page,
			sort_by: 'vote_count.desc',
			'vote_count.gte': MIN_VOTES,
			include_adult: false,
			...(kind === 'movie' ? { include_video: false } : {})
		});
		return data?.results?.map((r) => r.id) ?? [];
	});

	for (const batch of batches) ids.push(...batch);
	return [...new Set(ids)].slice(0, want);
}

function pickDirectors(kind, detail) {
	if (kind === 'series') return (detail.created_by ?? []).map((p) => p.name).filter(Boolean);
	return (detail.credits?.crew ?? [])
		.filter((c) => c.job === 'Director')
		.map((c) => c.name)
		.filter(Boolean);
}

function pickCast(detail) {
	return (detail.credits?.cast ?? [])
		.slice()
		.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
		.slice(0, CAST_KEPT)
		.map((c) => c.name)
		.filter(Boolean);
}

function year(value) {
	const parsed = Number.parseInt(String(value ?? '').slice(0, 4), 10);
	return Number.isFinite(parsed) ? parsed : null;
}

async function fetchTitle(kind, id) {
	const detail = await tmdb(`/${kind === 'movie' ? 'movie' : 'tv'}/${id}`, {
		append_to_response: 'credits'
	});
	if (!detail) return null;

	const name = kind === 'movie' ? detail.title : detail.name;
	const start = year(kind === 'movie' ? detail.release_date : detail.first_air_date);
	if (!name || !start) return null;
	if (!detail.genres?.length) return null;

	const end = kind === 'series' ? year(detail.last_air_date) : null;
	return {
		i: (kind === 'movie' ? 'm' : 't') + id,
		n: name,
		y: start,
		// Only claim an end year for a show TMDB says is finished.
		...(kind === 'series' && end && detail.status && detail.status !== 'Returning Series'
			? { e: end }
			: {}),
		k: kind === 'movie' ? 0 : 1,
		genreNames: detail.genres.map((g) => g.name),
		directorNames: pickDirectors(kind, detail),
		castNames: pickCast(detail),
		p: detail.poster_path ?? null,
		o: (detail.overview ?? '').trim(),
		r: Math.round((detail.vote_average ?? 0) * 10) / 10,
		v: detail.vote_count ?? 0
	};
}

async function collect(kind, want) {
	if (want <= 0) return [];
	const ids = await discoverIds(kind, want);
	console.log(`  ${ids.length} ids; fetching details and credits...`);
	const titles = await pooled(
		ids,
		(id) => fetchTitle(kind, id).catch(() => null),
		(done) => console.log(`  ${done}/${ids.length}`)
	);
	console.log(`  kept ${titles.length}`);
	return titles;
}

const started = Date.now();
const rows = [...(await collect('movie', WANT_MOVIES)), ...(await collect('series', WANT_SERIES))];

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

const titles = rows
	.map(({ genreNames, directorNames, castNames, ...rest }) => ({
		...rest,
		g: genreNames.map((g) => intern(genres, genreIndex, g)),
		d: directorNames.slice(0, 2).map((p) => intern(people, personIndex, p)),
		c: castNames.map((p) => intern(people, personIndex, p))
	}))
	// Most-voted first, so a cold profile still opens on something recognisable.
	.sort((a, b) => b.v - a.v);

// Key order matters for the packed rows; rebuild each one in the documented shape.
const packed = titles.map((t) => ({
	i: t.i,
	n: t.n,
	y: t.y,
	...(t.e ? { e: t.e } : {}),
	k: t.k,
	g: t.g,
	d: t.d,
	c: t.c,
	p: t.p,
	o: t.o,
	r: t.r,
	v: t.v
}));

const catalog = {
	version: 2,
	generatedAt: new Date().toISOString(),
	source: 'TMDB',
	genres,
	people,
	titles: packed
};

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(catalog));

const bytes = Buffer.byteLength(JSON.stringify(catalog));
console.log(
	`\nWrote ${packed.length} titles (${packed.filter((t) => t.k === 0).length} films, ` +
		`${packed.filter((t) => t.k === 1).length} series), ` +
		`${genres.length} genres, ${people.length} people.`
);
console.log(
	`${(bytes / 1024 / 1024).toFixed(2)} MB raw, ${packed.filter((t) => t.p).length} with posters, ` +
		`${requests} TMDB requests in ${Math.round((Date.now() - started) / 1000)}s.`
);
