<script lang="ts">
	interface Props {
		value?: number;
		size?: number;
		readonly?: boolean;
		label?: string;
		onchange?: (rating: number) => void;
	}

	let { value = 0, size = 34, readonly = false, label = 'Rating', onchange }: Props = $props();
</script>

<div class="stars" role={readonly ? 'img' : 'radiogroup'} aria-label="{label}{readonly ? `: ${value} of 5` : ''}">
	{#each [1, 2, 3, 4, 5] as star}
		{#if readonly}
			<span class="star" class:on={star <= value} style:--size="{size}px">★</span>
		{:else}
			<button
				type="button"
				class="star"
				class:on={star <= value}
				style:--size="{size}px"
				role="radio"
				aria-checked={star === value}
				aria-label="{star} star{star === 1 ? '' : 's'}"
				onclick={() => onchange?.(star)}
			>
				★
			</button>
		{/if}
	{/each}
</div>

<style>
	.stars {
		display: inline-flex;
		gap: 2px;
	}

	.star {
		padding: 0 2px;
		font-size: var(--size);
		line-height: 1.1;
		color: var(--border);
		transition:
			color 120ms,
			scale 120ms;
	}

	.star.on {
		color: var(--seen);
	}

	button.star:active {
		scale: 1.18;
	}
</style>
