import { catalog, featuresOf, groupOf, labelOf, GROUPS } from './catalog.svelte';
import type { Feature, Group } from './catalog.svelte';
import type { Entry, Library, Title } from './types';

/** How much one library entry pushes its features around.
 *  A star rating is the strongest evidence; a swipe is a hint. */
export function entryWeight(e: Entry): number {
	// A skip is explicitly "no opinion" — it must not tilt the profile either way.
	if (e.verdict === 'skipped') return 0;
	// 10 maps to +1, 5.5 to 0, 1 to -1.
	if (e.verdict === 'seen') return e.rating ? (e.rating - 5.5) / 4.5 : 0.25;
	if (e.verdict === 'watchlist') return 0.5;
	// "Never" is a real veto; a plain left swipe often just means "not tonight".
	return e.never ? -1.2 : -0.35;
}

/** Whether an entry is a usable training example, and its label.
 *  A 3-star rating and an unrated "seen" say nothing either way, so they are skipped. */
function labelOfEntry(e: Entry): 0 | 1 | null {
	if (e.verdict === 'watchlist') return 1;
	if (e.verdict === 'dismissed') return 0;
	if (e.verdict === 'seen' && e.rating) {
		if (e.rating >= 7) return 1;
		if (e.rating <= 4) return 0;
	}
	// Skips, 5-6 ratings and unrated "seen" say nothing either way.
	return null;
}

export type GroupScores = Record<Group, number>;

/** Summed, idf-damped affinity per feature, kept split by group so the model can
 *  learn that (say) director matters more to this user than genre does. */
export class Profile {
	value = new Map<Feature, number>();
	evidence = new Map<Feature, { title: Title; weight: number }>();
	ratedCount = 0;
	signalCount = 0;
	/** Learned per-group importance, plus a weight for the popularity prior. */
	weights: GroupScores & { quality: number } = {
		genre: 1,
		director: 1,
		cast: 1,
		decade: 0.5,
		quality: 1.2
	};
	/** How much to trust `weights`: 0 = defaults, 1 = fully learned. */
	confidence = 0;

	add(title: Title, weight: number) {
		for (const f of featuresOf(title)) {
			this.value.set(f, (this.value.get(f) ?? 0) + weight);
			if (weight > 0) {
				const best = this.evidence.get(f);
				if (!best || best.weight < weight) this.evidence.set(f, { title, weight });
			}
		}
	}

	/** Undo one title's contribution — used to score a training example against a
	 *  profile that has not seen it, so the fit is not judged on its own answers. */
	remove(title: Title, weight: number) {
		for (const f of featuresOf(title)) {
			this.value.set(f, (this.value.get(f) ?? 0) - weight);
		}
	}

	groupScores(title: Title): GroupScores {
		const scores: GroupScores = { genre: 0, director: 0, cast: 0, decade: 0 };
		const counts: Record<Group, number> = { genre: 0, director: 0, cast: 0, decade: 0 };

		for (const f of catalog.featuresFor(title.id)) {
			const group = groupOf(f);
			scores[group] += (this.value.get(f) ?? 0) * catalog.idf(f);
			counts[group]++;
		}
		// Normalise within a group so a long cast list isn't automatically ahead.
		for (const group of GROUPS) {
			if (counts[group] > 1) scores[group] /= Math.sqrt(counts[group]);
		}
		return scores;
	}

	score(title: Title): number {
		const s = this.groupScores(title);
		let total = this.weights.quality * title.quality;
		for (const group of GROUPS) total += this.weights[group] * s[group];
		return total;
	}
}

export function buildProfile(entries: Library): Profile {
	const profile = new Profile();
	const examples: { title: Title; weight: number; label: 0 | 1 }[] = [];

	for (const entry of Object.values(entries)) {
		const title = catalog.byId.get(entry.id);
		if (!title) continue;
		const weight = entryWeight(entry);
		profile.add(title, weight);
		profile.signalCount++;
		if (entry.verdict === 'seen' && entry.rating) profile.ratedCount++;

		const label = labelOfEntry(entry);
		if (label !== null) examples.push({ title, weight, label });
	}

	fitWeights(profile, examples);
	return profile;
}

const MIN_EXAMPLES = 8;
/** Weights are only fully trusted once there is this much evidence. */
const FULL_CONFIDENCE_AT = 40;

/** Fit per-group importances with a small logistic regression on the user's own
 *  swipes. Each example is scored against a profile with that example removed, so
 *  the model is judged on generalisation rather than on recall. */
function fitWeights(profile: Profile, examples: { title: Title; weight: number; label: 0 | 1 }[]) {
	const positives = examples.filter((e) => e.label === 1).length;
	const negatives = examples.length - positives;
	// Needs both classes, or there is nothing to separate.
	if (examples.length < MIN_EXAMPLES || positives === 0 || negatives === 0) return;

	const rows = examples.map(({ title, weight, label }) => {
		profile.remove(title, weight);
		const s = profile.groupScores(title);
		profile.add(title, weight);
		return { x: [s.genre, s.director, s.cast, s.decade, title.quality], label };
	});

	// Standardise each column; otherwise the quality prior (0-1) and the raw
	// affinity sums (which can reach double digits) get wildly different gradients.
	const dims = 5;
	const mean = Array.from({ length: dims }, (_, j) =>
		rows.reduce((sum, r) => sum + r.x[j], 0) / rows.length
	);
	const sd = Array.from({ length: dims }, (_, j) => {
		const variance = rows.reduce((sum, r) => sum + (r.x[j] - mean[j]) ** 2, 0) / rows.length;
		return Math.sqrt(variance) || 1;
	});
	for (const row of rows) row.x = row.x.map((v, j) => (v - mean[j]) / sd[j]);

	const theta = new Array(dims).fill(0);
	let bias = 0;
	const learningRate = 0.35;
	const l2 = 0.06;

	for (let step = 0; step < 400; step++) {
		const gradient = new Array(dims).fill(0);
		let biasGradient = 0;
		for (const row of rows) {
			let z = bias;
			for (let j = 0; j < dims; j++) z += theta[j] * row.x[j];
			const error = 1 / (1 + Math.exp(-z)) - row.label;
			for (let j = 0; j < dims; j++) gradient[j] += error * row.x[j];
			biasGradient += error;
		}
		for (let j = 0; j < dims; j++) {
			theta[j] = theta[j] - (learningRate * (gradient[j] / rows.length + l2 * theta[j]));
		}
		bias -= learningRate * (biasGradient / rows.length);
	}

	// Back out of the standardised space, keep the weights non-negative (a group
	// the user dislikes is already handled by negative feature values), and blend
	// toward the defaults while evidence is thin.
	const learned = theta.map((t, j) => Math.max(0, t / sd[j]));
	const scale = learned.reduce((a, b) => a + b, 0);
	if (!Number.isFinite(scale) || scale === 0) return;

	const confidence = Math.min(1, examples.length / FULL_CONFIDENCE_AT);
	const defaults = [
		profile.weights.genre,
		profile.weights.director,
		profile.weights.cast,
		profile.weights.decade,
		profile.weights.quality
	];
	// Rescale so the learned vector has the same overall magnitude as the defaults;
	// only the *balance* between groups is learned, not the absolute size.
	const target = defaults.reduce((a, b) => a + b, 0);
	const blended = learned.map(
		(v, j) => defaults[j] * (1 - confidence) + (v / scale) * target * confidence
	);

	profile.weights = {
		genre: blended[0],
		director: blended[1],
		cast: blended[2],
		decade: blended[3],
		quality: blended[4]
	};
	profile.confidence = confidence;
}

export interface Reason {
	label: string;
	because?: string;
}

/** The two strongest things this title has in common with what the user liked. */
export function reasonsFor(title: Title, profile: Profile, max = 2): Reason[] {
	const contributions = catalog
		.featuresFor(title.id)
		.map((f) => ({
			f,
			weight: (profile.value.get(f) ?? 0) * catalog.idf(f) * profile.weights[groupOf(f)]
		}))
		.filter((c) => c.weight > 0.05)
		.sort((a, b) => b.weight - a.weight);

	const reasons: Reason[] = [];
	const cited = new Set<string>();
	for (const { f } of contributions) {
		if (reasons.length >= max) break;
		const evidence = profile.evidence.get(f);
		if (evidence && cited.has(evidence.title.id)) continue;
		if (evidence) cited.add(evidence.title.id);
		reasons.push({ label: labelOf(f), because: evidence?.title.title });
	}
	return reasons;
}

/** The strongest positive features, for the "your taste" chips. Capped per group so
 *  a cast-heavy profile doesn't render six actor names and nothing else. */
export function topTastes(profile: Profile, max = 6, perGroup = 2): string[] {
	const scored = [...profile.value.entries()]
		.filter(([f, weight]) => weight > 0.4 && !f.startsWith('decade:'))
		.map(([f, weight]) => ({
			f,
			group: groupOf(f),
			score: weight * catalog.idf(f) * profile.weights[groupOf(f)]
		}))
		.sort((a, b) => b.score - a.score);

	const taken: Record<string, number> = {};
	const chosen = scored.filter((item) => {
		if ((taken[item.group] ?? 0) >= perGroup) return false;
		taken[item.group] = (taken[item.group] ?? 0) + 1;
		return true;
	});
	// Top up from whatever is left if some groups had nothing to offer.
	const rest = scored.filter((item) => !chosen.includes(item));
	return [...chosen, ...rest].slice(0, max).map(({ f }) => labelOf(f));
}

/** Stop one dominant genre from being the headline on every single row. After a
 *  label has led twice, promote a pick's second reason instead. */
export function spreadReasons<T extends { reasons: Reason[] }>(picks: T[]): T[] {
	const led = new Map<string, number>();
	return picks.map((pick) => {
		if (pick.reasons.length < 2) {
			if (pick.reasons[0]) led.set(pick.reasons[0].label, (led.get(pick.reasons[0].label) ?? 0) + 1);
			return pick;
		}
		const [first, ...others] = pick.reasons;
		const alternative = others.find((r) => (led.get(r.label) ?? 0) < (led.get(first.label) ?? 0));
		const reasons =
			(led.get(first.label) ?? 0) >= 2 && alternative
				? [alternative, first, ...others.filter((r) => r !== alternative)]
				: pick.reasons;
		led.set(reasons[0].label, (led.get(reasons[0].label) ?? 0) + 1);
		return { ...pick, reasons };
	});
}
