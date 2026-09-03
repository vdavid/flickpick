#!/usr/bin/env node
/**
 * Fills poster URLs, IMDb ids and IMDb ratings into src/lib/data/catalog.json from OMDb.
 *
 *   OMDB_API_KEY=xxxx npm run enrich          # only titles that are still missing a poster
 *   OMDB_API_KEY=xxxx npm run enrich -- --force   # refetch everything
 *
 * The key is only ever used here, at build time. Nothing about it reaches the browser
 * bundle: what ships is the resulting JSON.
 *
 * Titles that cannot be matched are listed at the end. Give those an "omdbQuery"
 * field in the catalog to override the search term.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CATALOG = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'data', 'catalog.json');
const KEY = process.env.OMDB_API_KEY;
const FORCE = process.argv.includes('--force');
const CONCURRENCY = 4;

if (!KEY) {
	console.warn('OMDB_API_KEY is not set — leaving the catalog as it is (the app falls back to generated art).');
	process.exit(0);
}

async function omdb(params) {
	const url = new URL('https://www.omdbapi.com/');
	url.searchParams.set('apikey', KEY);
	for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url);
			if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
			return await res.json();
		} catch (error) {
			if (attempt === 2) throw error;
			await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
		}
	}
}

/** OMDb has no discover endpoint, so we resolve each seed title by name. */
async function resolve(entry) {
	const query = entry.omdbQuery ?? entry.title;

	const exact = await omdb({ t: query, y: entry.year, type: entry.type });
	if (exact?.Response === 'True') return exact;

	const looser = await omdb({ t: query, type: entry.type });
	if (looser?.Response === 'True') return looser;

	const search = await omdb({ s: query, type: entry.type });
	if (search?.Response === 'True' && search.Search?.length) {
		const best = search.Search.map((hit) => ({
			hit,
			distance: Math.abs(Number.parseInt(hit.Year, 10) - entry.year) || 0
		})).sort((a, b) => a.distance - b.distance)[0];
		if (best.distance <= 2) return omdb({ i: best.hit.imdbID });
	}
	return null;
}

function merge(entry, data) {
	const rating = Number.parseFloat(data.imdbRating);
	return {
		...entry,
		poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
		imdbId: data.imdbID ?? null,
		imdbRating: Number.isFinite(rating) ? rating : null,
		runtime: data.Runtime && data.Runtime !== 'N/A' ? data.Runtime : null
	};
}

const catalog = JSON.parse(await readFile(CATALOG, 'utf8'));
const todo = catalog.filter((entry) => FORCE || !entry.poster);
console.log(`Resolving ${todo.length} of ${catalog.length} titles against OMDb...`);

const misses = [];
let done = 0;

async function worker(queue) {
	for (const entry of queue) {
		try {
			const data = await resolve(entry);
			if (data) Object.assign(entry, merge(entry, data));
			else misses.push(entry.title);
		} catch (error) {
			misses.push(`${entry.title} (${error.message})`);
		}
		done++;
		if (done % 10 === 0) console.log(`  ${done}/${todo.length}`);
	}
}

// Round-robin the queue so the workers finish at roughly the same time.
const queues = Array.from({ length: CONCURRENCY }, (_, i) => todo.filter((_, index) => index % CONCURRENCY === i));
await Promise.all(queues.map(worker));

await writeFile(CATALOG, JSON.stringify(catalog, null, '\t') + '\n');

const withPosters = catalog.filter((entry) => entry.poster).length;
console.log(`Done. ${withPosters}/${catalog.length} titles now have a poster.`);
if (misses.length) {
	console.log('\nNo OMDb match for:');
	for (const miss of misses) console.log(`  - ${miss}`);
	console.log('\nAdd an "omdbQuery" field to those entries in src/lib/data/catalog.json and rerun.');
}
