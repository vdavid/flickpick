import { catalog } from './catalog.svelte';
import { reasonsFor, type Profile, type Reason } from './taste';
import type { Library, Title } from './types';

export interface Pick {
	title: Title;
	score: number;
	reasons: Reason[];
	/** Deliberately drawn from outside the user's established taste. */
	wildcard: boolean;
}

/** Cap on how many of the best-scoring titles the picker may choose from. Wide
 *  enough that the deck varies between sessions, narrow enough to stay relevant. */
const SHORTLIST_MAX = 400;
/** ...but never more than this share of what's left, or a small catalog would have
 *  no "outside" left to draw wildcards from. */
const SHORTLIST_SHARE = 0.35;
/** Share of the deck reserved for titles the model would never have surfaced.
 *  Without this the deck collapses into one director within a dozen swipes. */
const WILDCARD_SHARE = 0.22;
/** How hard to punish a candidate for resembling something already in the deck. */
const DIVERSITY = 0.9;
/** Sampling width among the best remaining candidates. 1 would be pure greedy. */
const SAMPLE_TOP = 5;

function featureSet(title: Title): Set<string> {
	return new Set(catalog.featuresFor(title.id));
}

/** Jaccard overlap, but each shared feature counts by how rare it is. Two films
 *  sharing a lead actor are far more alike than two films that are both Dramas,
 *  and unweighted overlap cannot tell those apart — which is how a deck ends up
 *  showing four films by the same actor in a row. */
function similarity(a: Set<string>, b: Set<string>): number {
	let shared = 0;
	let total = 0;
	for (const f of a) {
		const weight = Math.max(0, catalog.idf(f));
		total += weight;
		if (b.has(f)) shared += weight;
	}
	for (const f of b) if (!a.has(f)) total += Math.max(0, catalog.idf(f));
	return total > 0 ? shared / total : 0;
}

function medianQuality(rows: { title: Title }[]): number {
	if (rows.length === 0) return 0;
	const sorted = rows.map((r) => r.title.quality).sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

function sampleIndex(count: number): number {
	// Biased toward the front, but not deterministic: squaring a uniform draw
	// picks the top item about half the time and still reaches the tail.
	return Math.floor(Math.random() ** 2 * count);
}

export interface DeckOptions {
	size: number;
	/** 0 disables wildcards — used for the For You list, which should stay on-taste. */
	explore?: number;
}

export function scoreAll(entries: Library, profile: Profile): { title: Title; score: number }[] {
	return catalog.titles
		.filter((t) => !entries[t.id])
		.map((title) => ({ title, score: profile.score(title) }))
		.sort((a, b) => b.score - a.score);
}

/** Assemble a deck: mostly the best on-taste candidates, spread out so consecutive
 *  cards don't repeat the same director or genre, with a few wildcards mixed in. */
export function buildDeck(entries: Library, profile: Profile, options: DeckOptions): Pick[] {
	const ranked = scoreAll(entries, profile);
	if (ranked.length === 0) return [];

	const explore = options.explore ?? WILDCARD_SHARE;
	const shortlistSize = Math.max(
		options.size * 2,
		Math.min(SHORTLIST_MAX, Math.ceil(ranked.length * SHORTLIST_SHARE))
	);
	const shortlist = ranked.slice(0, shortlistSize);

	// Wildcards come from outside the shortlist entirely, restricted to the better
	// half of what's out there so "different" never means "bad".
	const rest = ranked.slice(shortlistSize);
	const median = medianQuality(rest);
	const outside = rest.filter((r) => r.title.quality >= median);

	const picked: Pick[] = [];
	const pickedFeatures: Set<string>[] = [];
	const used = new Set<string>();

	const take = (entry: { title: Title; score: number }, wildcard: boolean) => {
		used.add(entry.title.id);
		pickedFeatures.push(featureSet(entry.title));
		picked.push({
			title: entry.title,
			score: entry.score,
			reasons: wildcard ? [] : reasonsFor(entry.title, profile),
			wildcard
		});
	};

	while (picked.length < options.size) {
		const wantWildcard = outside.length > 0 && Math.random() < explore;

		if (wantWildcard) {
			const pool = outside.filter((r) => !used.has(r.title.id));
			if (pool.length) {
				take(pool[Math.floor(Math.random() * pool.length)], true);
				continue;
			}
		}

		const remaining = shortlist.filter((r) => !used.has(r.title.id));
		if (remaining.length === 0) {
			const fallback = ranked.find((r) => !used.has(r.title.id));
			if (!fallback) break;
			take(fallback, false);
			continue;
		}

		// Maximal marginal relevance: best score minus how much it echoes the deck so far.
		const adjusted = remaining
			.map((entry) => {
				const features = featureSet(entry.title);
				let closest = 0;
				for (const other of pickedFeatures) closest = Math.max(closest, similarity(features, other));
				return { entry, value: entry.score - DIVERSITY * closest };
			})
			.sort((a, b) => b.value - a.value);

		take(adjusted[sampleIndex(Math.min(SAMPLE_TOP, adjusted.length))].entry, false);
	}

	return picked;
}

/** The For You list: on-taste only, still spread out, no wildcards. */
export function recommendations(entries: Library, profile: Profile, size: number): Pick[] {
	return buildDeck(entries, profile, { size, explore: 0 });
}
