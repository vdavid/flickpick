<script lang="ts">
	import { placeholderGradient } from '$lib/poster';
	import type { Title } from '$lib/types';

	interface Props {
		title: Title;
		/** Where the generated fallback art puts its type treatment.
		 *  `card` keeps it clear of the swipe card's own title block. */
		variant?: 'card' | 'detail' | 'thumb';
		eager?: boolean;
	}

	let { title, variant = 'detail', eager = false }: Props = $props();

	// If OMDb hands us a broken URL, fall back to the generated art rather than
	// showing a torn-image icon.
	let failed = $state(false);
	let src = $derived(failed ? null : title.poster);

	let kind = $derived(title.type === 'series' ? 'Series' : 'Film');
</script>

<div class="poster" style:background={placeholderGradient(title.id)}>
	{#if src}
		<img
			{src}
			alt="{title.title} poster"
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			onerror={() => (failed = true)}
		/>
	{:else if variant === 'thumb'}
		<div class="fallback thumb">
			<span class="kind">{kind}</span>
			<span class="year">{title.year}</span>
		</div>
	{:else}
		<div class="fallback" class:top={variant === 'card'}>
			<span class="kind">{kind}</span>
			<span class="name">{title.title}</span>
			<span class="year">{title.year}</span>
		</div>
	{/if}
</div>

<style>
	.poster {
		position: relative;
		container-type: inline-size;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: var(--surface);
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.fallback {
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 6px;
		height: 100%;
		padding: 8% 8% 12%;
	}

	/* Sits in the upper-middle of the card: clear of the swipe stamps above and of
	   the card's own title block below. */
	.fallback.top {
		justify-content: center;
		padding: 18% 9% 40%;
	}

	.fallback.thumb {
		justify-content: space-between;
		gap: 0;
		padding: 8px 7px;
	}

	.kind {
		font-size: clamp(8px, 2.8cqw, 12px);
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.62;
	}

	.name {
		font-size: clamp(13px, 9cqw, 44px);
		font-weight: 800;
		line-height: 1.05;
		letter-spacing: -0.03em;
		text-wrap: balance;
		overflow-wrap: anywhere;
	}

	.year {
		font-size: clamp(9px, 3.4cqw, 15px);
		opacity: 0.7;
	}
</style>
