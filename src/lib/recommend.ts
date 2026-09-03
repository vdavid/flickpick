import { catalog } from './catalog';
import type { Entry, Library, Title } from './types';

/** Feature keys look like "genre:Sci-Fi", "person:Christopher Nolan", "decade:1990", "type:series". */
type Feature = string;

export interface Reason {
	label: string;
	/** The title in the user's library that earned this feature its weight. */
	because?: string;
}

export interface Scored {
	title: Title;
	score: number;
	reasons: Reason[];
}

function people(t: Title): string[] {
	return [...t.director.split(',').map((s) => s.trim()), ...t.cast].filter(Boolean);
}

export function featuresOf(t: Title): Feature[] {
	return [
		...t.genres.map((g) => `genre:${g}`),
		...people(t).map((p) => `person:${p}`),
		`decade:${Math.floor(t.year / 10) * 10}`,
		`type:${t.type}`
	];
}

/** How common a feature is across the whole catalog. Rare features (a director) say
 *  much more about taste than common ones (Drama), so we damp by inverse frequency. */
const documentFrequency = (() => {
	const df = new Map<Feature, number>();
	for (const t of catalog) for (const f of featuresOf(t)) df.set(f, (df.get(f) ?? 0) + 1);
	return df;
})();

function idf(f: Feature): number {
	return Math.log(catalog.length / (1 + (documentFrequency.get(f) ?? 0)));
}

/** How much a single library entry should push its features around.
 *  A rating is the strongest signal; a swipe is a weak one. */
export function entryWeight(e: Entry): number {
	if (e.verdict === 'seen') return e.rating ? (e.rating - 3) / 2 : 0.3;
	if (e.verdict === 'watchlist') return 0.5;
	return -0.6; // dismissed
}

export interface Profile {
	value: Map<Feature, number>;
	/** Best piece of evidence per feature, for the "why are you showing me this" line. */
	evidence: Map<Feature, { title: Title; entry: Entry }>;
	ratedCount: number;
	signalCount: number;
}

export function buildProfile(entries: Library): Profile {
	const value = new Map<Feature, number>();
	const evidence = new Map<Feature, { title: Title; entry: Entry }>();
	let ratedCount = 0;
	let signalCount = 0;

	for (const entry of Object.values(entries)) {
		const title = catalog.find((t) => t.id === entry.id);
		if (!title) continue;
		const w = entryWeight(entry);
		if (entry.verdict === 'seen' && entry.rating) ratedCount++;
		signalCount++;
		for (const f of featuresOf(title)) {
			value.set(f, (value.get(f) ?? 0) + w);
			if (w > 0) {
				const best = evidence.get(f);
				if (!best || entryWeight(best.entry) < w) evidence.set(f, { title, entry });
			}
		}
	}
	return { value, evidence, ratedCount, signalCount };
}

/** Taste score, plus a small popularity prior so an empty profile still orders sensibly. */
export function scoreTitle(t: Title, profile: Profile): number {
	const features = featuresOf(t);
	let taste = 0;
	for (const f of features) taste += (profile.value.get(f) ?? 0) * idf(f);
	// Normalise so titles with long cast lists aren't automatically ahead.
	taste /= Math.sqrt(features.length);
	const prior = (t.buzz / 100) * 0.6;
	return taste + prior;
}

function reasonsFor(t: Title, profile: Profile, max = 2): Reason[] {
	const contributions = featuresOf(t)
		.map((f) => ({ f, weight: (profile.value.get(f) ?? 0) * idf(f) }))
		.filter((c) => c.weight > 0.05)
		.sort((a, b) => b.weight - a.weight);

	const reasons: Reason[] = [];
	const usedEvidence = new Set<string>();
	for (const { f } of contributions) {
		if (reasons.length >= max) break;
		const [kind, rest] = [f.slice(0, f.indexOf(':')), f.slice(f.indexOf(':') + 1)];
		const label =
			kind === 'genre' ? rest : kind === 'person' ? rest : kind === 'decade' ? `the ${String(rest).slice(2)}s` : rest;
		if (kind === 'type') continue;
		const ev = profile.evidence.get(f);
		// Don't cite the same library title twice on one card.
		if (ev && usedEvidence.has(ev.title.id) && reasons.length > 0) continue;
		if (ev) usedEvidence.add(ev.title.id);
		reasons.push({ label, because: ev?.title.title });
	}
	return reasons;
}

/** Everything the user hasn't filed yet, best first. Used for both the deck and For You. */
export function rankUndecided(entries: Library, profile: Profile): Scored[] {
	return catalog
		.filter((t) => !entries[t.id])
		.map((t) => ({ title: t, score: scoreTitle(t, profile), reasons: reasonsFor(t, profile) }))
		.sort((a, b) => b.score - a.score);
}
