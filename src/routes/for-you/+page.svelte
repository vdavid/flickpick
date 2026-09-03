<script lang="ts">
	import TitleRow from '$lib/components/TitleRow.svelte';
	import { library } from '$lib/library.svelte';
	import { catalog } from '$lib/catalog.svelte';
	import { buildProfile, spreadReasons, topTastes, type Reason } from '$lib/taste';
	import { recommendations } from '$lib/deck';
	import { base } from '$app/paths';
	import type { TitleType } from '$lib/types';

	let filter = $state<TitleType | 'all'>('all');

	let profile = $derived(buildProfile(library.entries));
	let tastes = $derived(topTastes(profile));

	// Ask for extra so the type filter still has something to show.
	let picks = $derived(
		spreadReasons(
			recommendations(library.entries, profile, 60).filter(
				(p) => filter === 'all' || p.title.type === filter
			)
		)
	);

	/** What the model decided matters most to this user, once it has enough to go on. */
	let learned = $derived.by(() => {
		if (profile.confidence < 0.25) return null;
		const groups = [
			{ key: 'director', label: 'who directs it' },
			{ key: 'cast', label: 'who is in it' },
			{ key: 'genre', label: 'the genre' },
			{ key: 'decade', label: 'the era' }
		] as const;
		const ranked = groups
			.map((g) => ({ ...g, weight: profile.weights[g.key] }))
			.sort((a, b) => b.weight - a.weight);
		return ranked[0].weight > ranked[1].weight * 1.15 ? ranked[0].label : null;
	});

	function reasonText(reasons: Reason[]): string {
		return reasons.map((r) => (r.because ? `${r.label}, like ${r.because}` : r.label)).join(' · ');
	}
</script>

<div class="page">
	<div class="page-header">
		<h1>For You</h1>
		<p>
			{#if profile.ratedCount >= 3}
				Built from {profile.ratedCount} rating{profile.ratedCount === 1 ? '' : 's'} and {profile.signalCount}
				swipes{#if learned}, and you seem to care most about <strong>{learned}</strong>{/if}.
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

	{#if tastes.length}
		<div class="tastes">
			<span class="chip">Your taste</span>
			{#each tastes as taste}
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
			{#each picks.slice(0, 25) as pick (pick.title.id)}
				<TitleRow
					title={pick.title}
					note={reasonText(pick.reasons) || catalog.blurb(pick.title.id)}
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

	<p class="count">{catalog.titles.length.toLocaleString()} titles in the catalog</p>
</div>

<style>
	.page-header strong {
		color: var(--text);
	}

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
		padding: 0 20px 4px;
	}

	.cta {
		margin-top: 10px;
	}

	.cta a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}

	.count {
		padding: 16px 20px 28px;
		color: var(--muted);
		font-size: 11px;
		text-align: center;
	}
</style>
