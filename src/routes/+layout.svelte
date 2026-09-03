<script lang="ts">
	import '../app.css';
	import TabBar from '$lib/components/TabBar.svelte';
	import { library } from '$lib/library.svelte';
	import { catalog } from '$lib/catalog.svelte';

	let { children } = $props();

	library.init();
	catalog.load();
</script>

<svelte:head>
	<title>FlickPick — Swipe. Rate. Discover your next obsession.</title>
</svelte:head>

{#if catalog.status === 'ready'}
	{@render children()}
	<TabBar />
{:else if catalog.status === 'error'}
	<div class="splash">
		<h1>Flick<span>Pick</span></h1>
		<p class="fail">The catalog didn't load.</p>
		<p class="detail">{catalog.error}</p>
		<button onclick={() => location.reload()}>Try again</button>
	</div>
{:else}
	<div class="splash">
		<h1>Flick<span>Pick</span></h1>
		<p>Swipe. Rate. Discover your next obsession.</p>
		<div class="bar"><i></i></div>
	</div>
{/if}

<style>
	.splash {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100dvh;
		padding: 24px;
		text-align: center;
	}

	h1 {
		font-size: 30px;
		letter-spacing: -0.03em;
	}

	h1 span {
		color: var(--accent);
	}

	p {
		margin: 0;
		color: var(--muted);
		font-size: 14px;
	}

	.fail {
		color: var(--text);
		font-size: 16px;
		font-weight: 600;
	}

	.detail {
		font-size: 12px;
		opacity: 0.7;
	}

	button {
		margin-top: 10px;
		padding: 10px 18px;
		border: 1px solid var(--border);
		border-radius: 12px;
		font-size: 14px;
		font-weight: 600;
	}

	.bar {
		width: 140px;
		height: 3px;
		margin-top: 12px;
		border-radius: 999px;
		background: var(--border);
		overflow: hidden;
	}

	.bar i {
		display: block;
		width: 40%;
		height: 100%;
		border-radius: 999px;
		background: var(--accent);
		animation: slide 1.1s ease-in-out infinite;
	}

	@keyframes slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(350%);
		}
	}
</style>
