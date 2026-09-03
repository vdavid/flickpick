<script lang="ts">
	interface Props {
		value?: number;
		/** Ten steps: five stars turned out to be too blunt, and half-stars are
		 *  fiddly targets on a phone. */
		max?: number;
		size?: number;
		readonly?: boolean;
		label?: string;
		/** Shows the number next to the stars, so a tap is visibly registered. */
		showValue?: boolean;
		onchange?: (rating: number) => void;
	}

	let {
		value = 0,
		max = 10,
		size = 26,
		readonly = false,
		label = 'Rating',
		showValue = false,
		onchange
	}: Props = $props();

	let stars = $derived(Array.from({ length: max }, (_, i) => i + 1));
</script>

<div class="wrap" class:compact={!showValue}>
	<div
		class="stars"
		role={readonly ? 'img' : 'radiogroup'}
		aria-label="{label}{readonly ? `: ${value} of ${max}` : ''}"
	>
		{#each stars as star}
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
					aria-label="{star} out of {max}"
					onclick={() => onchange?.(star)}
				>
					★
				</button>
			{/if}
		{/each}
	</div>
	{#if showValue}
		<span class="value" class:set={value > 0}>{value > 0 ? `${value}/${max}` : `–/${max}`}</span>
	{/if}
</div>

<style>
	.wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		width: 100%;
	}

	.stars {
		display: flex;
		justify-content: center;
		width: 100%;
	}

	.star {
		flex: 1 1 0;
		/* Narrow targets are fine as long as they are tall enough to hit. */
		min-height: 44px;
		padding: 0;
		font-size: var(--size);
		line-height: 1;
		color: var(--border);
		transition:
			color 100ms,
			scale 100ms;
	}

	.compact .star {
		min-height: 0;
		flex: 0 0 auto;
		padding: 0 1px;
	}

	.star.on {
		color: var(--seen);
	}

	button.star:active {
		scale: 1.2;
	}

	.value {
		color: var(--muted);
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.value.set {
		color: var(--seen);
	}
</style>
