<script lang="ts">
	import Poster from '$lib/components/Poster.svelte';
	import StarRating from '$lib/components/StarRating.svelte';
	import TitleRow from '$lib/components/TitleRow.svelte';
	import { catalog, yearLabel } from '$lib/catalog.svelte';
	import { library } from '$lib/library.svelte';

	let tab = $state<'todo' | 'rated'>('todo');
	let query = $state('');

	let toRate = $derived(
		library
			.list('seen')
			.filter((e) => !e.rating)
			.map((e) => catalog.byId.get(e.id))
			.filter((t) => t !== undefined)
	);

	let rated = $derived(
		library
			.list('seen')
			.filter((e) => e.rating)
			.map((e) => ({ title: catalog.byId.get(e.id), rating: e.rating! }))
			.filter((r) => r.title !== undefined)
	);

	let current = $derived(toRate[0]);

	let results = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) return [];
		const hits = [];
		for (const t of catalog.titles) {
			if (t.title.toLowerCase().includes(q) && library.verdictOf(t.id) !== 'seen') hits.push(t);
			// The catalog runs to thousands of titles; stop as soon as the list is full.
			if (hits.length === 8) break;
		}
		return hits;
	});
</script>

<div class="page">
	<div class="page-header">
		<h1>Rate</h1>
		<p>Stars teach FlickPick what you like. Three ratings is enough to start.</p>
	</div>

	<div class="search">
		<input
			type="search"
			bind:value={query}
			placeholder="Seen something else? Search the catalog"
			aria-label="Search titles to mark as seen"
		/>
		{#if results.length}
			<ul class="results">
				{#each results as title}
					<li>
						<button
							onclick={() => {
								library.set(title.id, 'seen');
								query = '';
								tab = 'todo';
							}}
						>
							<span>{title.title}</span>
							<em>{yearLabel(title)}</em>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="tabs" role="tablist">
		<button role="tab" aria-selected={tab === 'todo'} class:on={tab === 'todo'} onclick={() => (tab = 'todo')}>
			To rate {toRate.length ? `(${toRate.length})` : ''}
		</button>
		<button role="tab" aria-selected={tab === 'rated'} class:on={tab === 'rated'} onclick={() => (tab = 'rated')}>
			Rated {rated.length ? `(${rated.length})` : ''}
		</button>
	</div>

	{#if tab === 'todo'}
		{#if current}
			<div class="focus">
				<div class="art"><Poster title={current} eager /></div>
				<h2>{current.title}</h2>
				<p class="sub">{yearLabel(current)} · {current.genres.slice(0, 3).join(', ')}</p>
				<StarRating
					value={0}
					size={40}
					label="Rate {current.title}"
					onchange={(rating) => library.rate(current.id, rating)}
				/>
				<button class="skip" onclick={() => library.set(current.id, 'watchlist')}>
					Haven't actually seen it → watchlist
				</button>
				{#if toRate.length > 1}
					<p class="queue">{toRate.length - 1} more waiting</p>
				{/if}
			</div>
		{:else}
			<div class="empty">
				<strong>Nothing left to rate</strong>
				Swipe up on the Discover deck to mark things you've already seen, or search above.
			</div>
		{/if}
	{:else if rated.length}
		<div class="list">
			{#each rated as item}
				<TitleRow title={item.title!}>
					{#snippet trailing()}
						<div class="row-stars">
							<StarRating
								value={item.rating}
								size={20}
								label="Rating for {item.title!.title}"
								onchange={(rating) => library.rate(item.title!.id, rating)}
							/>
						</div>
					{/snippet}
				</TitleRow>
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>No ratings yet</strong>
			Rate a few titles and the For You tab starts working.
		</div>
	{/if}
</div>

<style>
	.search {
		position: relative;
		margin: 0 20px 14px;
	}

	input {
		width: 100%;
		padding: 11px 14px;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--bg-elevated);
		color: var(--text);
		font-size: 15px;
	}

	input::placeholder {
		color: var(--muted);
	}

	.results {
		position: absolute;
		z-index: 20;
		inset: calc(100% + 6px) 0 auto 0;
		margin: 0;
		padding: 4px;
		list-style: none;
		border: 1px solid var(--border);
		border-radius: 12px;
		background: var(--surface);
		box-shadow: 0 14px 30px rgba(0, 0, 0, 0.5);
	}

	.results button {
		display: flex;
		justify-content: space-between;
		gap: 10px;
		width: 100%;
		padding: 10px 10px;
		border-radius: 8px;
		text-align: left;
		font-size: 14px;
	}

	.results em {
		flex: none;
		color: var(--muted);
		font-style: normal;
		font-size: 12px;
	}

	.tabs {
		display: flex;
		gap: 6px;
		margin: 0 20px 16px;
		padding: 4px;
		border-radius: 12px;
		background: var(--bg-elevated);
	}

	.tabs button {
		flex: 1;
		padding: 8px;
		border-radius: 9px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}

	.tabs button.on {
		background: var(--surface);
		color: var(--text);
	}

	.focus {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 4px 20px 30px;
		text-align: center;
	}

	.art {
		width: min(56vw, 220px);
		aspect-ratio: 2 / 3;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
	}

	.focus h2 {
		margin-top: 8px;
		font-size: 21px;
		text-wrap: balance;
	}

	.sub {
		margin: 0 0 6px;
		font-size: 13px;
		color: var(--muted);
	}

	.skip {
		margin-top: 6px;
		font-size: 13px;
		color: var(--muted);
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.queue {
		margin: 2px 0 0;
		font-size: 12px;
		color: var(--muted);
	}

	.list {
		padding: 0 20px 24px;
	}

	.row-stars {
		margin-top: 6px;
	}
</style>
