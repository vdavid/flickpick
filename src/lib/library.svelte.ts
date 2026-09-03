import { browser } from '$app/environment';
import type { Entry, Library, Verdict } from './types';

const STORAGE_KEY = 'flickpick.library.v2';
/** v1 rated out of 5. v2 rates out of 10, so old entries are doubled on the way in. */
const LEGACY_KEY = 'flickpick.library.v1';

function load(): Library {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as Library;
			return typeof parsed === 'object' && parsed !== null ? parsed : {};
		}
		const legacy = localStorage.getItem(LEGACY_KEY);
		if (!legacy) return {};
		const parsed = JSON.parse(legacy) as Library;
		if (typeof parsed !== 'object' || parsed === null) return {};
		for (const entry of Object.values(parsed)) {
			if (entry.rating) entry.rating = Math.min(10, entry.rating * 2);
		}
		return parsed;
	} catch {
		return {};
	}
}

/** The user's whole library. Demo build: one device, localStorage only.
 *  When the Go backend lands this module is the single place that has to change. */
class LibraryStore {
	entries = $state<Library>({});
	#loaded = false;

	/** Called once from the root layout, after hydration. */
	init() {
		if (this.#loaded) return;
		this.#loaded = true;
		this.entries = load();
	}

	#persist() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
		} catch {
			// Private mode / quota. The session still works, it just won't survive a reload.
		}
	}

	get(id: string): Entry | undefined {
		return this.entries[id];
	}

	verdictOf(id: string): Verdict | undefined {
		return this.entries[id]?.verdict;
	}

	set(id: string, verdict: Verdict, rating?: number) {
		const prev = this.entries[id];
		this.entries[id] = {
			id,
			verdict,
			// Keep an existing rating when re-filing a title, unless a new one is given.
			rating: rating ?? (verdict === 'seen' ? prev?.rating : undefined),
			updatedAt: Date.now()
		};
		this.#persist();
	}

	rate(id: string, rating: number) {
		this.entries[id] = { id, verdict: 'seen', rating, updatedAt: Date.now() };
		this.#persist();
	}

	/** An assumed rating from onboarding: it steers the picks straight away, but
	 *  still shows up as something to rate for real. */
	seedRating(id: string, rating: number) {
		this.entries[id] = { id, verdict: 'seen', rating, provisional: true, updatedAt: Date.now() };
		this.#persist();
	}

	/** Upgrade a plain "not tonight" dismissal into a real veto. */
	markNever(id: string) {
		this.entries[id] = { id, verdict: 'dismissed', never: true, updatedAt: Date.now() };
		this.#persist();
	}

	remove(id: string) {
		delete this.entries[id];
		this.#persist();
	}

	reset() {
		this.entries = {};
		this.#persist();
	}

	list(verdict: Verdict): Entry[] {
		return Object.values(this.entries)
			.filter((e) => e.verdict === verdict)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}

	/** Skips are not a verdict, so they don't count as progress through the catalog. */
	get decided(): number {
		return Object.values(this.entries).filter((e) => e.verdict !== 'skipped').length;
	}

	/** Seen titles still waiting on a real rating, provisional ones included. */
	get unratedSeen(): Entry[] {
		return this.list('seen').filter((e) => !e.rating || e.provisional);
	}
}

export const library = new LibraryStore();
