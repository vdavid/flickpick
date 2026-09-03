<script lang="ts">
	import '../app.css';
	import TabBar from '$lib/components/TabBar.svelte';
	import { library } from '$lib/library.svelte';

	let { children } = $props();

	library.init();
</script>

<svelte:head>
	<title>FlickPick — Swipe. Rate. Discover your next obsession.</title>
</svelte:head>

{@render children()}
<TabBar />
