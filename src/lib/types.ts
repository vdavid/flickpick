export type TitleType = 'movie' | 'series';

/** A catalog entry. Everything except `poster`/`imdbId` ships in the repo;
 *  those two are filled in by `npm run enrich` from OMDb. */
export interface Title {
	id: string;
	title: string;
	year: number;
	endYear?: number;
	type: TitleType;
	genres: string[];
	/** Director for movies, creator(s) for series. May list several, comma separated. */
	director: string;
	cast: string[];
	blurb: string;
	/** Override the OMDb search term when the catalog title doesn't match theirs. */
	omdbQuery?: string;
	/** Editorial 0-100 prominence used to order the deck before we know any taste. */
	buzz: number;
	poster?: string | null;
	imdbId?: string | null;
	runtime?: string | null;
	imdbRating?: number | null;
}

/** What the user did with a title. */
export type Verdict = 'seen' | 'watchlist' | 'dismissed';

export interface Entry {
	id: string;
	verdict: Verdict;
	/** 1-5 stars, only meaningful for `seen`. */
	rating?: number;
	/** ms epoch of the last change. */
	updatedAt: number;
}

export type Library = Record<string, Entry>;
