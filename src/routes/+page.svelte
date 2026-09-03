<script lang="ts">
	import SwipeCard from '$lib/components/SwipeCard.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import { library } from '$lib/library.svelte';
	import { catalog } from '$lib/catalog.svelte';
	import { buildProfile } from '$lib/taste';
	import { buildDeck, type Pick } from '$lib/deck';
	import type { Verdict } from '$lib/types';
	import { base } from '$app/paths';

	const QUEUE_SIZE = 18;
	const REFILL_BELOW = 5;
	const ONBOARDED_KEY = 'flickpick.onboarded.v1';

	let queue = $state<Pick[]>([]);
	let cards = $state<SwipeCard[]>([]);
	let last = $state<{ id: string; title: string; verdict: Verdict } | null>(null);
	let showOnboarding = $state(false);

	// Only offer the picker to someone with nothing on file who hasn't dismissed it.
	try {
		showOnboarding = library.decided === 0 && localStorage.getItem(ONBOARDED_KEY) === null;
	} catch {
		showOnboarding = library.decided === 0;
	}

	/** Rebuild against the current taste profile. Done in batches rather than after
	 *  every swipe, so the cards behind the top one stay where they are. */
	function refill() {
		const profile = buildProfile(library.entries);
		const known = new Set(queue.map((p) => p.title.id));
		const additions = buildDeck(library.entries, profile, { size: QUEUE_SIZE }).filter(
			(p) => !known.has(p.title.id)
		);
		queue = [...queue, ...additions].slice(0, QUEUE_SIZE);
	}

	$effect(() => {
		if (!showOnboarding && queue.length === 0) refill();
	});

	function decide(verdict: Verdict) {
		const top = queue[0];
		if (!top) return;
		library.set(top.title.id, verdict);
		last = { id: top.title.id, title: top.title.title, verdict };
		queue = queue.slice(1);
		if (queue.length < REFILL_BELOW) refill();
	}

	function undo() {
		if (!last) return;
		library.remove(last.id);
		const title = catalog.byId.get(last.id);
		if (title) queue = [{ title, score: 0, reasons: [], wildcard: false }, ...queue];
		last = null;
	}

	function never() {
		if (!last) return;
		library.markNever(last.id);
		last = null;
	}

	function finishOnboarding() {
		try {
			localStorage.setItem(ONBOARDED_KEY, '1');
		} catch {
			// Private mode; the picker will just offer itself again next time.
		}
		showOnboarding = false;
	}

	function onKeydown(event: KeyboardEvent) {
		if (showOnboarding || event.metaKey || event.ctrlKey || event.altKey) return;
		const map: Record<string, Verdict> = {
			ArrowLeft: 'dismissed',
			ArrowRight: 'watchlist',
			ArrowUp: 'seen',
			ArrowDown: 'skipped'
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

	const VERDICT_WORDS: Record<Verdict, string> = {
		watchlist: 'Watchlisted',
		seen: 'Marked seen',
		dismissed: 'Buried',
		skipped: 'Skipped'
	};
	let verdictWord = $derived(last ? VERDICT_WORDS[last.verdict] : '');
</script>

<svelte:window onkeydown={onKeydown} />

{#if showOnboarding}
	<Onboarding onDone={finishOnboarding} />
{:else}
	<div class="page discover">
		<header>
			<div>
				<h1>Flick<span>Pick</span></h1>
				<p>Swipe. Rate. Discover your next obsession.</p>
			</div>
			<span class="progress">{library.decided}/{catalog.titles.length}</span>
		</header>

		<div class="deck">
			{#each queue.slice(0, 3) as pick, i (pick.title.id)}
				<SwipeCard
					bind:this={cards[i]}
					title={pick.title}
					reasons={i === 0 ? pick.reasons : []}
					wildcard={pick.wildcard}
					depth={i}
					interactive={i === 0}
					onDecide={decide}
				/>
			{/each}

			{#if queue.length === 0}
				<div class="done">
					<strong>That's everything.</strong>
					<p>You've filed all {catalog.titles.length} titles. Rate what you've seen to sharpen the picks.</p>
					<a href="{base}/rate">Go rate →</a>
				</div>
			{/if}
		</div>

		<div class="actions">
			<button class="act nope" onclick={() => cards[0]?.fling('dismissed')} aria-label="Not interested" disabled={!queue.length}>
				<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
			<button class="act skip" onclick={() => cards[0]?.fling('skipped')} aria-label="Skip, no opinion" disabled={!queue.length}>
				<svg viewBox="0 0 24 24"><path d="M12 5v13M7 13l5 5 5-5" /></svg>
			</button>
			<button class="act seen" onclick={() => cards[0]?.fling('seen')} aria-label="Already seen it" disabled={!queue.length}>
				<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></svg>
			</button>
			<button class="act want" onclick={() => cards[0]?.fling('watchlist')} aria-label="Add to watchlist" disabled={!queue.length}>
				<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.2L6 21z" /></svg>
			</button>
		</div>

		{#if last}
			<div class="lastbar">
				<span class="what">{verdictWord} <b>{last.title}</b></span>
				<div>
					{#if last.verdict === 'dismissed'}
						<button onclick={never}>Never again</button>
					{/if}
					<button onclick={undo}>Undo</button>
				</div>
			</div>
		{:else}
			<p class="legend">
				<span style:color="var(--nope)">← Not for me</span>
				<span style:color="var(--seen)">↑ Seen it</span>
				<span style:color="var(--muted)">↓ Skip</span>
				<span style:color="var(--want)">Watchlist →</span>
			</p>
		{/if}
	</div>
{/if}

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
		margin-bottom: 12px;
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

	.act.nope {
		color: var(--nope);
	}

	.act.skip {
		width: 46px;
		height: 46px;
		color: var(--muted);
	}

	.act.skip svg {
		width: 20px;
		height: 20px;
	}

	.act.seen {
		color: var(--seen);
	}

	.act.want {
		color: var(--want);
	}

	.legend,
	.lastbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		min-height: 30px;
		margin: 0 2px 6px;
		font-size: 10.5px;
		font-weight: 600;
		white-space: nowrap;
	}

	.lastbar .what {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--muted);
		font-weight: 500;
	}

	.lastbar b {
		color: var(--text);
	}

	.lastbar div {
		display: flex;
		flex: none;
		gap: 6px;
	}

	.lastbar button {
		padding: 5px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
	}
</style>
