<script lang="ts">
	import Poster from './Poster.svelte';
	import { catalog } from '$lib/catalog.svelte';
	import { library } from '$lib/library.svelte';
	import type { Title } from '$lib/types';

	interface Props {
		onDone: () => void;
	}

	let { onDone }: Props = $props();

	// Nine fits a phone screen without scrolling, and is plenty to seed a profile.
	const WANTED = 9;

	/** A dozen widely known titles spread across genres and eras. Starting from a
	 *  handful of "I loved this" answers beats cold-swiping: the model has real
	 *  positives from the first card instead of learning only from rejections. */
	const grid: Title[] = (() => {
		const pool = catalog.titles.slice(0, 220);
		const chosen: Title[] = [];
		const genreUse = new Map<string, number>();
		const decadeUse = new Map<number, number>();

		for (const title of pool) {
			if (chosen.length >= WANTED) break;
			const decade = Math.floor(title.year / 10) * 10;
			const genreCost = title.genres.reduce((sum, g) => sum + (genreUse.get(g) ?? 0), 0);
			// Skip anything that would be the third of its genre or its decade.
			if (genreCost >= 2 * title.genres.length || (decadeUse.get(decade) ?? 0) >= 3) continue;
			chosen.push(title);
			for (const g of title.genres) genreUse.set(g, (genreUse.get(g) ?? 0) + 1);
			decadeUse.set(decade, (decadeUse.get(decade) ?? 0) + 1);
		}
		// Top up if the diversity rules were too strict for a small catalog.
		for (const title of pool) {
			if (chosen.length >= WANTED) break;
			if (!chosen.includes(title)) chosen.push(title);
		}
		return chosen;
	})();

	let picked = $state<Set<string>>(new Set());

	function toggle(id: string) {
		const next = new Set(picked);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		picked = next;
	}

	function start() {
		for (const id of picked) library.rate(id, 5);
		onDone();
	}
</script>

<div class="onboarding">
	<header>
		<h1>Which of these did you <em>love</em>?</h1>
		<p>Tap any you'd happily rewatch. This is what the picks are built from.</p>
	</header>

	<div class="grid">
		{#each grid as title (title.id)}
			<button
				class="tile"
				class:on={picked.has(title.id)}
				aria-pressed={picked.has(title.id)}
				onclick={() => toggle(title.id)}
			>
				<Poster {title} variant="thumb" eager />
				<span class="check" aria-hidden="true">✓</span>
				<span class="name">{title.title}</span>
			</button>
		{/each}
	</div>

	<footer>
		<button class="go" onclick={start} disabled={picked.size === 0}>
			{picked.size === 0 ? 'Pick at least one' : `Start swiping (${picked.size})`}
		</button>
		<button class="skip" onclick={onDone}>Skip, I'll just swipe</button>
	</footer>
</div>

<style>
	.onboarding {
		min-height: 100dvh;
		padding: 0 16px calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px));
	}

	header {
		padding: 20px 4px 14px;
	}

	h1 {
		font-size: 23px;
		line-height: 1.2;
		text-wrap: balance;
	}

	h1 em {
		color: var(--accent);
		font-style: normal;
	}

	header p {
		margin: 6px 0 0;
		color: var(--muted);
		font-size: 13px;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}

	.tile {
		position: relative;
		display: block;
		padding: 0;
		border-radius: 12px;
		overflow: hidden;
		aspect-ratio: 2 / 3;
		text-align: left;
		transition: scale 120ms;
	}

	.tile.on {
		outline: 3px solid var(--want);
		outline-offset: -3px;
	}

	.tile:active {
		scale: 0.96;
	}

	.name {
		position: absolute;
		inset: auto 0 0 0;
		padding: 16px 7px 6px;
		background: linear-gradient(to top, rgba(6, 6, 12, 0.92), transparent);
		font-size: 11px;
		font-weight: 600;
		line-height: 1.2;
	}

	.check {
		position: absolute;
		top: 6px;
		right: 6px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: var(--want);
		color: #06121b;
		font-size: 13px;
		font-weight: 800;
		opacity: 0;
		scale: 0.6;
		transition:
			opacity 120ms,
			scale 120ms;
	}

	.tile.on .check {
		opacity: 1;
		scale: 1;
	}

	footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 20px 0 26px;
	}

	.go {
		width: 100%;
		padding: 14px;
		border-radius: 14px;
		background: var(--accent);
		color: #fff;
		font-size: 15px;
		font-weight: 700;
	}

	.go:disabled {
		background: var(--surface);
		color: var(--muted);
	}

	.skip {
		color: var(--muted);
		font-size: 13px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
