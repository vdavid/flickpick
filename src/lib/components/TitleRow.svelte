<script lang="ts">
	import Poster from './Poster.svelte';
	import { yearLabel } from '$lib/catalog';
	import type { Title } from '$lib/types';
	import type { Snippet } from 'svelte';

	interface Props {
		title: Title;
		/** Small line under the title: reasons, genres, whatever the page needs. */
		note?: string;
		noteTone?: 'muted' | 'accent';
		actions?: Snippet;
		trailing?: Snippet;
	}

	let { title, note, noteTone = 'muted', actions, trailing }: Props = $props();
</script>

<article>
	<div class="thumb"><Poster {title} variant="thumb" /></div>
	<div class="body">
		<h3>{title.title}</h3>
		<p class="sub">
			{title.type === 'series' ? 'Series' : 'Film'} · {yearLabel(title)} · {title.genres
				.slice(0, 2)
				.join(', ')}
		</p>
		{#if note}
			<p class="note" class:accent={noteTone === 'accent'}>{note}</p>
		{/if}
		{#if trailing}{@render trailing()}{/if}
	</div>
	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</article>

<style>
	article {
		display: flex;
		gap: 12px;
		align-items: center;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
	}

	.thumb {
		flex: none;
		width: 54px;
		height: 80px;
		border-radius: 8px;
		overflow: hidden;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	h3 {
		font-size: 15px;
		line-height: 1.25;
	}

	.sub {
		margin: 3px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.note {
		margin: 5px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.note.accent {
		color: var(--want);
	}

	.actions {
		display: flex;
		flex: none;
		gap: 6px;
	}

	.actions :global(button) {
		display: grid;
		place-items: center;
		width: 38px;
		height: 38px;
		border: 1px solid var(--border);
		border-radius: 10px;
		background: var(--bg-elevated);
		color: var(--muted);
	}

	.actions :global(button svg) {
		width: 18px;
		height: 18px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.actions :global(button:active) {
		scale: 0.92;
	}
</style>
