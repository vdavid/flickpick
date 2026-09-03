<script lang="ts">
	import TitleRow from '$lib/components/TitleRow.svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import { getTitle } from '$lib/catalog';
	import { library } from '$lib/library.svelte';
	import type { Verdict } from '$lib/types';

	const tabs: { key: Verdict; label: string; empty: string }[] = [
		{ key: 'watchlist', label: 'Watchlist', empty: 'Swipe right on the deck to park things here.' },
		{ key: 'seen', label: 'Seen', empty: 'Swipe up on the deck to log what you have already watched.' },
		{ key: 'dismissed', label: 'Not for me', empty: 'Swipe left on the deck to bury things here.' }
	];

	let tab = $state<Verdict>('watchlist');
	let confirmingReset = $state(false);

	let items = $derived(
		library
			.list(tab)
			.map((entry) => ({ entry, title: getTitle(entry.id) }))
			.filter((item) => item.title !== undefined)
	);
</script>

<div class="page">
	<div class="page-header">
		<h1>Lists</h1>
		<p>Everything you have filed, newest first.</p>
	</div>

	<div class="tabs" role="tablist">
		{#each tabs as t}
			<button role="tab" aria-selected={tab === t.key} class:on={tab === t.key} onclick={() => (tab = t.key)}>
				{t.label}
				{#if library.list(t.key).length}<em>{library.list(t.key).length}</em>{/if}
			</button>
		{/each}
	</div>

	{#if items.length}
		<div class="list">
			{#each items as item (item.entry.id)}
				<TitleRow title={item.title!} note={item.title!.blurb}>
					{#snippet trailing()}
						{#if tab === 'seen'}
							<div class="row-stars">
								<StarRating
									value={item.entry.rating ?? 0}
									size={18}
									label="Rating for {item.title!.title}"
									onchange={(rating) => library.rate(item.entry.id, rating)}
								/>
							</div>
						{/if}
					{/snippet}
					{#snippet actions()}
						{#if tab !== 'watchlist'}
							<button aria-label="Move to watchlist" onclick={() => library.set(item.entry.id, 'watchlist')}>
								<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.2L6 21z" /></svg>
							</button>
						{/if}
						{#if tab !== 'seen'}
							<button aria-label="Mark as seen" onclick={() => library.set(item.entry.id, 'seen')}>
								<svg viewBox="0 0 24 24"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="2.6" /></svg>
							</button>
						{/if}
						<button aria-label="Remove from list" onclick={() => library.remove(item.entry.id)}>
							<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					{/snippet}
				</TitleRow>
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>Empty for now</strong>
			{tabs.find((t) => t.key === tab)?.empty}
		</div>
	{/if}

	{#if library.decided > 0}
		<div class="reset">
			{#if confirmingReset}
				<p>Delete all {library.decided} filed titles from this device?</p>
				<div>
					<button
						class="danger"
						onclick={() => {
							library.reset();
							confirmingReset = false;
						}}>Yes, clear everything</button
					>
					<button onclick={() => (confirmingReset = false)}>Cancel</button>
				</div>
			{:else}
				<button onclick={() => (confirmingReset = true)}>Clear my data</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.tabs {
		display: flex;
		gap: 6px;
		margin: 0 20px 12px;
		padding: 4px;
		border-radius: 12px;
		background: var(--bg-elevated);
	}

	.tabs button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		flex: 1;
		padding: 8px 4px;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.tabs button.on {
		background: var(--surface);
		color: var(--text);
	}

	.tabs em {
		font-style: normal;
		font-size: 11px;
		opacity: 0.7;
	}

	.list {
		padding: 0 20px;
	}

	.row-stars {
		margin-top: 6px;
	}

	.reset {
		padding: 26px 20px 34px;
		text-align: center;
		color: var(--muted);
		font-size: 13px;
	}

	.reset p {
		margin: 0 0 10px;
	}

	.reset div {
		display: flex;
		gap: 8px;
		justify-content: center;
	}

	.reset button {
		padding: 8px 14px;
		border: 1px solid var(--border);
		border-radius: 10px;
		font-size: 13px;
		color: var(--muted);
	}

	.reset button.danger {
		border-color: var(--nope);
		color: var(--nope);
	}
</style>
