import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';

export const IMDB_RATINGS_URL = 'https://datasets.imdbws.com/title.ratings.tsv.gz';

/**
 * Stream IMDb's ratings dump and attach `ir` / `iv` to the rows it matches.
 *
 * The dump has millions of lines and we want a few thousand, so it is filtered
 * as it decompresses rather than parsed into memory. Rows are matched on the
 * IMDb id TMDB gave us, so this costs one download and no per-title requests.
 *
 * IMDb publishes this dataset for non-commercial use only.
 *
 * @param {{imdbId?: string|null, ir?: number, iv?: number}[]} rows
 * @param {{url?: string, log?: (message: string) => void, timeoutMs?: number}} [options]
 * @returns {Promise<number>} how many rows were matched
 */
export async function addImdbRatings(rows, options = {}) {
	const { url = IMDB_RATINGS_URL, log = () => {}, timeoutMs = 120000 } = options;

	const wanted = new Map();
	for (const row of rows) if (row.imdbId) wanted.set(row.imdbId, row);
	if (wanted.size === 0) {
		log('No IMDb ids to match; skipping IMDb ratings.');
		return 0;
	}

	log(`Joining IMDb ratings for ${wanted.size} ids...`);
	const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) throw new Error(`IMDb dataset responded ${res.status}`);

	const lines = createInterface({
		input: Readable.fromWeb(res.body).pipe(createGunzip()),
		crlfDelay: Number.POSITIVE_INFINITY
	});

	let matched = 0;
	let scanned = 0;
	for await (const line of lines) {
		scanned++;
		const tab = line.indexOf('\t');
		if (tab < 0) continue;
		const row = wanted.get(line.slice(0, tab));
		if (!row) continue;

		const [, rating, votes] = line.split('\t');
		const parsedRating = Number.parseFloat(rating);
		const parsedVotes = Number.parseInt(votes, 10);
		if (Number.isFinite(parsedRating)) row.ir = parsedRating;
		if (Number.isFinite(parsedVotes)) row.iv = parsedVotes;

		matched++;
		// The dump is far longer than our catalog; stop as soon as it is satisfied.
		if (matched === wanted.size) break;
	}

	log(`  matched ${matched}/${wanted.size} after scanning ${scanned} rows`);
	return matched;
}
