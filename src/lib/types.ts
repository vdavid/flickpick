export type TitleType = 'movie' | 'series';

/** The compact on-the-wire catalog. Genre and person names are interned into
 *  shared tables and referenced by index, which roughly halves the payload. */
export interface CatalogFile {
	version: 2;
	generatedAt: string;
	source: string;
	genres: string[];
	people: string[];
	titles: PackedTitle[];
}

/** Short keys, because this is repeated thousands of times. */
export interface PackedTitle {
	/** "m<tmdbId>" for a film, "t<tmdbId>" for a series. Stable across rebuilds. */
	i: string;
	n: string;
	y: number;
	/** Series end year, absent while running. */
	e?: number;
	/** 0 = movie, 1 = series. */
	k: 0 | 1;
	g: number[];
	/** Directors (films) or creators (series). */
	d: number[];
	/** Top-billed cast. */
	c: number[];
	/** TMDB poster path, e.g. "/abc123.jpg". Null when TMDB has no art. */
	p: string | null;
	/** TMDB vote average (0-10) and vote count. */
	r: number;
	v: number;
}

/** A catalog entry once unpacked for use. */
export interface Title {
	id: string;
	title: string;
	year: number;
	endYear?: number;
	type: TitleType;
	genres: string[];
	directors: string[];
	cast: string[];
	posterPath: string | null;
	voteAverage: number;
	voteCount: number;
	/** Bayesian-shrunk quality score in 0-1, precomputed once at load. */
	quality: number;
}

/** `skipped` means "not now, and don't read anything into it": it takes the card
 *  off the deck without feeding the taste model. */
export type Verdict = 'seen' | 'watchlist' | 'dismissed' | 'skipped';

export interface Entry {
	id: string;
	verdict: Verdict;
	/** 1-10 stars, only meaningful for `seen`. */
	rating?: number;
	/** A hard "never show me this kind of thing again", set from the swipe bar. */
	never?: boolean;
	updatedAt: number;
}

export type Library = Record<string, Entry>;
