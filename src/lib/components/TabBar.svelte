<script lang="ts">
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { library } from '$lib/library.svelte';

	const tabs = [
		{ href: '', label: 'Discover', icon: 'M6 4l12 8-12 8z' },
		{ href: '/rate', label: 'Rate', icon: 'M12 3l2.6 5.8 6.4.7-4.8 4.3 1.3 6.2L12 17l-5.5 3 1.3-6.2L3 9.5l6.4-.7z' },
		{ href: '/lists', label: 'Lists', icon: 'M4 6h16M4 12h16M4 18h10' },
		{ href: '/for-you', label: 'For You', icon: 'M12 20s-7-4.5-7-9.3A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7 2.7C19 15.5 12 20 12 20z' }
	];

	let watchlistCount = $derived(library.list('watchlist').length);
	let current = $derived(page.url.pathname.replace(base, '').replace(/\/$/, ''));
</script>

<nav>
	{#each tabs as tab}
		{@const active = current === tab.href}
		<a href="{base}{tab.href || '/'}" class:active aria-current={active ? 'page' : undefined}>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d={tab.icon} fill={tab.label === 'Discover' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
			<span>{tab.label}</span>
			{#if tab.href === '/lists' && watchlistCount > 0}
				<em>{watchlistCount}</em>
			{/if}
		</a>
	{/each}
</nav>

<style>
	nav {
		position: fixed;
		inset: auto 0 0 0;
		z-index: 50;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		height: calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px));
		padding-bottom: env(safe-area-inset-bottom, 0px);
		background: rgba(10, 10, 15, 0.88);
		backdrop-filter: blur(16px);
		border-top: 1px solid var(--border);
	}

	a {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		text-decoration: none;
		color: var(--muted);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		transition: color 140ms;
	}

	a.active {
		color: var(--accent);
	}

	svg {
		width: 22px;
		height: 22px;
	}

	em {
		position: absolute;
		top: 6px;
		left: 50%;
		translate: 8px 0;
		min-width: 17px;
		padding: 1px 4px;
		border-radius: 999px;
		background: var(--accent);
		color: #fff;
		font-size: 10px;
		font-style: normal;
		font-weight: 700;
		text-align: center;
	}
</style>
