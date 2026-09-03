<script lang="ts">
	import Poster from './Poster.svelte';
	import { yearLabel } from '$lib/catalog.svelte';
	import type { Title, Verdict } from '$lib/types';
	import type { Reason } from '$lib/taste';

	interface Props {
		title: Title;
		reasons?: Reason[];
		/** Shown with a badge, so a deliberate left-field pick doesn't read as a bad one. */
		wildcard?: boolean;
		/** Only the top card of the stack listens to pointers. */
		interactive?: boolean;
		/** Depth in the stack (0 = top), used for the scale/offset of the cards behind. */
		depth?: number;
		onDecide: (verdict: Verdict) => void;
	}

	let { title, reasons = [], wildcard = false, interactive = true, depth = 0, onDecide }: Props =
		$props();

	const THRESHOLD = 88;
	const FLY_MS = 240;

	let dx = $state(0);
	let dy = $state(0);
	let dragging = $state(false);
	let flying = $state(false);
	let pointerId: number | null = null;
	let originX = 0;
	let originY = 0;

	/** Which verdict the current drag is aiming at, and how committed it is (0-1). */
	let intent = $derived.by((): { verdict: Verdict; progress: number } | null => {
		if (dx === 0 && dy === 0) return null;
		if (dy < 0 && Math.abs(dy) > Math.abs(dx)) {
			return { verdict: 'seen', progress: Math.min(1, -dy / THRESHOLD) };
		}
		if (Math.abs(dx) < 4) return null;
		return {
			verdict: dx > 0 ? 'watchlist' : 'dismissed',
			progress: Math.min(1, Math.abs(dx) / THRESHOLD)
		};
	});

	let rotation = $derived(Math.max(-14, Math.min(14, dx / 16)));

	function start(event: PointerEvent) {
		if (!interactive || flying) return;
		pointerId = event.pointerId;
		originX = event.clientX;
		originY = event.clientY;
		dragging = true;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function move(event: PointerEvent) {
		if (!dragging || event.pointerId !== pointerId) return;
		dx = event.clientX - originX;
		dy = event.clientY - originY;
	}

	function end(event: PointerEvent) {
		if (!dragging || event.pointerId !== pointerId) return;
		dragging = false;
		pointerId = null;
		if (intent && intent.progress >= 1) fling(intent.verdict);
		else {
			dx = 0;
			dy = 0;
		}
	}

	/** Also used by the action buttons, so a tap animates exactly like a swipe. */
	export function fling(verdict: Verdict) {
		if (flying) return;
		flying = true;
		if (verdict === 'seen') {
			dy = -window.innerHeight;
			dx = 0;
		} else {
			dx = (verdict === 'watchlist' ? 1 : -1) * window.innerWidth * 1.2;
			dy = -40;
		}
		setTimeout(() => onDecide(verdict), FLY_MS);
	}
</script>

<div
	class="card"
	role="group"
	aria-label="{title.title} ({title.year})"
	class:dragging
	class:flying
	class:interactive
	style:transform="translate3d({dx}px, {dy}px, 0) rotate({rotation}deg) scale({1 - depth * 0.04})"
	style:translate="0 {depth * 10}px"
	style:z-index={10 - depth}
	onpointerdown={start}
	onpointermove={move}
	onpointerup={end}
	onpointercancel={end}
>
	<Poster {title} variant="card" eager={depth < 2} />

	<div class="scrim"></div>

	{#if intent}
		<div class="stamp {intent.verdict}" style:opacity={intent.progress}>
			{#if intent.verdict === 'seen'}Seen it{:else if intent.verdict === 'watchlist'}Watchlist{:else}Not for me{/if}
		</div>
	{/if}

	<div class="meta">
		<div class="tags">
			{#if wildcard}<span class="chip wild">Something different</span>{/if}
			<span class="chip">{title.type === 'series' ? 'Series' : 'Film'}</span>
			<span class="chip">{yearLabel(title)}</span>
			{#each title.genres.slice(0, 2) as genre}
				<span class="chip">{genre}</span>
			{/each}
		</div>
		<h2>{title.title}</h2>
		<p class="blurb">{title.blurb}</p>
		<p class="credit">
			{[title.directors.join(', '), title.cast.slice(0, 2).join(', ')].filter(Boolean).join(' · ')}
		</p>
		{#if reasons.length}
			<p class="why">
				{#each reasons as reason, i}
					{i > 0 ? ' · ' : ''}<strong>{reason.label}</strong>{#if reason.because}
						from {reason.because}{/if}
				{/each}
			</p>
		{/if}
	</div>
</div>

<style>
	.card {
		position: absolute;
		inset: 0;
		border-radius: var(--radius);
		overflow: hidden;
		background: var(--surface);
		box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
		will-change: transform;
		user-select: none;
	}

	.interactive {
		touch-action: none;
		cursor: grab;
	}

	.card:not(.dragging) {
		transition:
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			translate 240ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.dragging {
		cursor: grabbing;
	}

	.flying {
		transition: transform 240ms ease-out;
	}

	.scrim {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgba(6, 6, 12, 0.96) 0%,
			rgba(6, 6, 12, 0.75) 26%,
			rgba(6, 6, 12, 0.05) 58%
		);
		pointer-events: none;
	}

	.meta {
		position: absolute;
		inset: auto 0 0 0;
		padding: 0 18px 20px;
		pointer-events: none;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-bottom: 8px;
	}

	h2 {
		font-size: 25px;
		line-height: 1.12;
		text-wrap: balance;
	}

	.blurb {
		margin: 7px 0 0;
		font-size: 14px;
		line-height: 1.4;
		color: rgba(244, 244, 248, 0.82);
	}

	.credit {
		margin: 8px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.chip.wild {
		background: rgba(255, 179, 64, 0.16);
		color: var(--seen);
	}

	.why {
		margin: 9px 0 0;
		font-size: 12px;
		color: var(--want);
	}

	.why strong {
		font-weight: 700;
	}

	.stamp {
		position: absolute;
		top: 26px;
		padding: 8px 18px;
		border: 3px solid currentColor;
		border-radius: 12px;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		backdrop-filter: blur(2px);
		pointer-events: none;
	}

	/* Each stamp hugs the edge that stays on screen as the card travels. */
	.stamp.watchlist {
		left: 20px;
		color: var(--want);
		rotate: -8deg;
	}

	.stamp.dismissed {
		right: 20px;
		color: var(--nope);
		rotate: 8deg;
	}

	.stamp.seen {
		left: 50%;
		translate: -50% 0;
		color: var(--seen);
	}
</style>
