<script lang="ts">
	import TitleRow from '$lib/components/TitleRow.svelte';
	import { library } from '$lib/library.svelte';
	import { buildProfile, rankUndecided } from '$lib/recommend';
	import { base } from '$app/paths';
	import type { TitleType } from '$lib/types';

	let filter = $state<TitleType | 'all'>('all');

	let profile = $derived(buildProfile(library.entries));

	let picks = $derived(
		rankUndecided(library.entries, profile)
			.filter((s) => filter === 'all' || s.title.type === filter)
			.slice(0, 20)
	);

	/** The strongest things we learned, shown so the picks don't feel like a black box. */
	let topTastes = $derived(
		[...profile.value.entries()]
			.filter(([feature, weight]) => weight > 0.4 && !feature.startsWith('type:') && !feature.startsWith('decade:'))
			.sort((a, b) => b[1] - a[1])
			.slice(0, 6)
			.map(([feature]) => feature.slice(feature.indexOf(':') + 1))
	);

	function reasonText(reasons: { label: string; because?: string }[]): string {
		if (!reasons.length) return '';
		return reasons
			.map((r) => (r.because ? `${r.label}, like ${r.because}` : r.label))
			.join(' · ');
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>For You</h1>
		<p>
			{#if profile.ratedCount >= 3}
				Built from {profile.ratedCount} rating{profile.ratedCount === 1 ? '' : 's'} and {profile.signalCount} swipes.
			{:else}
				Rate a few titles and this list stops guessing.
			{/if}
		</p>
	</div>

	{#if profile.ratedCount < 3}
		<div class="empty">
			<strong>Needs {3 - profile.ratedCount} more rating{3 - profile.ratedCount === 1 ? '' : 's'}</strong>
			Swipe up on things you've seen, then give them stars.
			<div class="cta"><a href="{base}/rate">Rate something →</a></div>
		</div>
	{/if}

	{#if topTastes.length}
		<div class="tastes">
			<span class="chip">Your taste</span>
			{#each topTastes as taste}
				<span class="taste">{taste}</span>
			{/each}
		</div>
	{/if}

	<div class="tabs" role="tablist">
		{#each [{ k: 'all', l: 'Everything' }, { k: 'movie', l: 'Films' }, { k: 'series', l: 'Series' }] as option}
			<button
				role="tab"
				aria-selected={filter === option.k}
				class:on={filter === option.k}
				onclick={() => (filter = option.k as TitleType | 'all')}
			>
				{option.l}
			</button>
		{/each}
	</div>

	{#if picks.length}
		<div class="list">
			{#each picks as pick, i (pick.title.id)}
				<TitleRow
					title={pick.title}
					note={reasonText(pick.reasons) || pick.title.blurb}
					noteTone={pick.reasons.length ? 'accent' : 'muted'}
				>
					{#snippet actions()}
						<button aria-label="Add {pick.title.title} to watchlist" onclick={() => library.set(pick.title.id, 'watchlist')}>
							<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.2L6 21z" /></svg>
						</button>
						<button aria-label="Not interested in {pick.title.title}" onclick={() => library.set(pick.title.id, 'dismissed')}>
							<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					{/snippet}
				</TitleRow>
			{/each}
		</div>
	{:else}
		<div class="empty">
			<strong>Nothing left here</strong>
			You have filed every title in this filter.
		</div>
	{/if}
</div>

<style>
	.tastes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 0 20px 14px;
	}

	.taste {
		padding: 4px 10px;
		border: 1px solid var(--border);
		border-radius: 999px;
		font-size: 12px;
		font-weight: 600;
		color: var(--want);
	}

	.tabs {
		display: flex;
		gap: 6px;
		margin: 0 20px 12px;
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

	.list {
		padding: 0 20px 26px;
	}

	.cta {
		margin-top: 10px;
	}

	.cta a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}
</style>
