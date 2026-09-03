import { browser } from '$app/environment';
import type { Entry, Library, Verdict } from './types';

const STORAGE_KEY = 'flickpick.library.v1';

function load(): Library {
	if (!browser) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as Library;
		return typeof parsed === 'object' && parsed !== null ? parsed : {};
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
		const prev = this.entries[id];
		this.entries[id] = { id, verdict: 'seen', rating, updatedAt: Date.now(), ...(prev ? {} : {}) };
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

	get decided(): number {
		return Object.keys(this.entries).length;
	}

	get unratedSeen(): Entry[] {
		return this.list('seen').filter((e) => !e.rating);
	}
}

export const library = new LibraryStore();
