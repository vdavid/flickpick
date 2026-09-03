<script lang="ts">
	import SwipeCard from '$lib/components/SwipeCard.svelte';
	import { library } from '$lib/library.svelte';
	import { buildProfile, rankUndecided, type Scored } from '$lib/recommend';
	import { catalog } from '$lib/catalog';
	import type { Verdict } from '$lib/types';
	import { base } from '$app/paths';

	const QUEUE_SIZE = 24;
	const REFILL_BELOW = 6;

	let queue = $state<Scored[]>([]);
	let cards = $state<SwipeCard[]>([]);
	let undoStack = $state<string[]>([]);

	/** Re-rank the remaining titles against the current taste profile. We do this in
	 *  batches rather than after every swipe so the cards behind the top one stay put. */
	function refill() {
		const ranked = rankUndecided(library.entries, buildProfile(library.entries));
		const seenIds = new Set(queue.map((s) => s.title.id));
		const additions = ranked.filter((s) => !seenIds.has(s.title.id));
		queue = [...queue, ...additions].slice(0, QUEUE_SIZE);
	}

	$effect(() => {
		if (queue.length === 0) refill();
	});

	function decide(verdict: Verdict) {
		const top = queue[0];
		if (!top) return;
		library.set(top.title.id, verdict);
		undoStack = [...undoStack, top.title.id];
		queue = queue.slice(1);
		if (queue.length < REFILL_BELOW) refill();
	}

	function undo() {
		const id = undoStack.at(-1);
		if (!id) return;
		undoStack = undoStack.slice(0, -1);
		library.remove(id);
		const title = catalog.find((t) => t.id === id);
		if (title) queue = [{ title, score: 0, reasons: [] }, ...queue];
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		const map: Record<string, Verdict> = {
			ArrowLeft: 'dismissed',
			ArrowRight: 'watchlist',
			ArrowUp: 'seen'
		};
		const verdict = map[event.key];
		if (verdict) {
			event.preventDefault();
			cards[0]?.fling(verdict);
		} else if (event.key === 'Backspace') {
			event.preventDefault();
			undo();
		}
	}

	let progress = $derived(library.decided);
</script>

<svelte:window onkeydown={onKeydown} />

<div class="page discover">
	<header>
		<div>
			<h1>Flick<span>Pick</span></h1>
			<p>Swipe. Rate. Discover your next obsession.</p>
		</div>
		<span class="progress">{progress}/{catalog.length}</span>
	</header>

	<div class="deck">
		{#each queue.slice(0, 3) as scored, i (scored.title.id)}
			<SwipeCard
				bind:this={cards[i]}
				title={scored.title}
				reasons={i === 0 ? scored.reasons : []}
				depth={i}
				interactive={i === 0}
				onDecide={decide}
			/>
		{/each}

		{#if queue.length === 0}
			<div class="done">
				<strong>That's the whole catalog.</strong>
				<p>You've filed all {catalog.length} titles. Rate what you've seen to sharpen the picks.</p>
				<a href="{base}/rate">Go rate →</a>
			</div>
		{/if}
	</div>

	<div class="actions">
		<button class="act nope" onclick={() => cards[0]?.fling('dismissed')} aria-label="Not interested" disabled={!queue.length}>
			<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</button>
		<button class="act undo" onclick={undo} aria-label="Undo last swipe" disabled={!undoStack.length}>
			<svg viewBox="0 0 24 24"><path d="M9 14l-4-4 4-4" /><path d="M5 10h8a5 5 0 0 1 0 10h-2" /></svg>
		</button>
		<button class="act seen" onclick={() => cards[0]?.fling('seen')} aria-label="Already seen it" disabled={!queue.length}>
			<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></svg>
		</button>
		<button class="act want" onclick={() => cards[0]?.fling('watchlist')} aria-label="Add to watchlist" disabled={!queue.length}>
			<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.2L6 21z" /></svg>
		</button>
	</div>

	<p class="legend">
		<span style:color="var(--nope)">← Not for me</span>
		<span style:color="var(--seen)">↑ Seen it</span>
		<span style:color="var(--want)">Watchlist →</span>
	</p>
</div>

<style>
	.discover {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding: 0 16px calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px));
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 2px 10px;
	}

	h1 {
		font-size: 22px;
		letter-spacing: -0.03em;
	}

	h1 span {
		color: var(--accent);
	}

	header p {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.progress {
		flex: none;
		padding: 5px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--muted);
	}

	.deck {
		position: relative;
		flex: 1;
		min-height: 0;
		margin-bottom: 14px;
	}

	.done {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 24px;
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		text-align: center;
		color: var(--muted);
	}

	.done strong {
		color: var(--text);
		font-size: 17px;
	}

	.done p {
		margin: 0;
		font-size: 14px;
	}

	.done a {
		margin-top: 6px;
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 14px;
		padding-bottom: 8px;
	}

	.act {
		display: grid;
		place-items: center;
		width: 58px;
		height: 58px;
		border: 1px solid var(--border);
		border-radius: 50%;
		background: var(--bg-elevated);
		transition:
			scale 120ms,
			opacity 120ms;
	}

	.act:active:not(:disabled) {
		scale: 0.9;
	}

	.act:disabled {
		opacity: 0.3;
	}

	.act svg {
		width: 26px;
		height: 26px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.act.undo {
		width: 46px;
		height: 46px;
		color: var(--muted);
	}

	.act.undo svg {
		width: 20px;
		height: 20px;
	}

	.act.nope {
		color: var(--nope);
	}

	.act.seen {
		color: var(--seen);
	}

	.act.want {
		color: var(--want);
	}

	.legend {
		display: flex;
		justify-content: space-between;
		margin: 0 6px 6px;
		font-size: 11px;
		font-weight: 600;
	}
</style>
