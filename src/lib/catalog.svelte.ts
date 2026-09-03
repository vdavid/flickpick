import { base } from '$app/paths';
import type { CatalogFile, PackedTitle, Title } from './types';

/** Feature keys look like "genre:Sci-Fi", "director:Christopher Nolan",
 *  "cast:Keanu Reeves", "decade:1990". The prefix is the group name. */
export type Feature = string;
export type Group = 'genre' | 'director' | 'cast' | 'decade';
export const GROUPS: Group[] = ['genre', 'director', 'cast', 'decade'];

/** Votes needed before a title's own average outweighs the catalog average.
 *  Keeps a 9.8 with 210 votes from beating a 8.6 with 30,000. */
const VOTE_PRIOR = 3000;

function unpack(packed: PackedTitle, file: CatalogFile, meanRating: number): Title {
	const votes = packed.v;
	return {
		id: packed.i,
		title: packed.n,
		year: packed.y,
		endYear: packed.e,
		type: packed.k === 1 ? 'series' : 'movie',
		genres: packed.g.map((i) => file.genres[i]).filter(Boolean),
		directors: packed.d.map((i) => file.people[i]).filter(Boolean),
		cast: packed.c.map((i) => file.people[i]).filter(Boolean),
		posterPath: packed.p,
		voteAverage: packed.r,
		voteCount: votes,
		imdbRating: packed.ir ?? null,
		imdbVotes: packed.iv ?? null,
		quality:
			((votes / (votes + VOTE_PRIOR)) * packed.r + (VOTE_PRIOR / (votes + VOTE_PRIOR)) * meanRating) /
			10
	};
}

export function featuresOf(t: Title): Feature[] {
	return [
		...t.genres.map((g) => `genre:${g}`),
		...t.directors.map((p) => `director:${p}`),
		...t.cast.map((p) => `cast:${p}`),
		`decade:${Math.floor(t.year / 10) * 10}`
	];
}

export function groupOf(feature: Feature): Group {
	return feature.slice(0, feature.indexOf(':')) as Group;
}

export function labelOf(feature: Feature): string {
	const value = feature.slice(feature.indexOf(':') + 1);
	return feature.startsWith('decade:') ? `the ${value.slice(2)}s` : value;
}

/** Everything derived from the catalog alone: the per-title feature lists and how
 *  rare each feature is. Computed once at load so scoring stays a tight loop. */
export class CatalogStore {
	titles = $state<Title[]>([]);
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	error = $state<string | null>(null);
	generatedAt = $state<string | null>(null);
	source = $state<string | null>(null);

	/** Overviews arrive separately, after the app is already interactive. */
	blurbs = $state<Record<string, string>>({});

	byId = new Map<string, Title>();
	features = new Map<string, Feature[]>();
	#idf = new Map<Feature, number>();

	/** Rare features say far more about taste than common ones: sharing a director
	 *  is a real signal, both being a Drama is almost none. */
	idf(feature: Feature): number {
		return this.#idf.get(feature) ?? Math.log(this.titles.length || 2);
	}

	blurb(id: string): string {
		return this.blurbs[id] ?? '';
	}

	async load(fetcher: typeof fetch = fetch) {
		if (this.status === 'loading' || this.status === 'ready') return;
		this.status = 'loading';
		try {
			const res = await fetcher(`${base}/catalog.json`);
			if (!res.ok) throw new Error(`catalog.json responded ${res.status}`);
			const file = (await res.json()) as CatalogFile;
			this.#ingest(file);
			this.status = 'ready';
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			this.status = 'error';
			return;
		}
		// Deliberately not awaited: overviews are nice to have, and the deck is
		// perfectly usable while they are still in flight.
		void this.#loadBlurbs(fetcher);
	}

	async #loadBlurbs(fetcher: typeof fetch) {
		try {
			const res = await fetcher(`${base}/blurbs.json`);
			if (res.ok) this.blurbs = (await res.json()) as Record<string, string>;
		} catch {
			// Cards simply show credits and genres instead.
		}
	}

	#ingest(file: CatalogFile) {
		const meanRating =
			file.titles.reduce((sum, t) => sum + t.r, 0) / Math.max(1, file.titles.length);

		const titles = file.titles.map((packed) => unpack(packed, file, meanRating));
		const documentFrequency = new Map<Feature, number>();

		for (const title of titles) {
			const features = featuresOf(title);
			this.features.set(title.id, features);
			this.byId.set(title.id, title);
			for (const f of features) documentFrequency.set(f, (documentFrequency.get(f) ?? 0) + 1);
		}

		for (const [feature, count] of documentFrequency) {
			this.#idf.set(feature, Math.log(titles.length / (1 + count)));
		}

		this.titles = titles;
		this.generatedAt = file.generatedAt;
		this.source = file.source;
	}

	featuresFor(id: string): Feature[] {
		return this.features.get(id) ?? [];
	}
}

export const catalog = new CatalogStore();

/** "2008–2013", "2016–", "1999" */
export function yearLabel(t: Title): string {
	if (t.type === 'movie') return String(t.year);
	if (t.endYear && t.endYear !== t.year) return `${t.year}–${t.endYear}`;
	if (t.endYear === t.year) return String(t.year);
	return `${t.year}–`;
}

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export function posterUrl(t: Title, size: 'w185' | 'w500'): string | null {
	return t.posterPath ? `${TMDB_IMAGE}/${size}${t.posterPath}` : null;
}
