<script lang="ts">
	import type { Snippet } from 'svelte';

	/** Gold-soft sticky note: no radius, shadow, rotated ±1–3°. */
	interface Props {
		tilt?: number;
		padding?: string;
		children: Snippet;
	}
	let { tilt = 1.2, padding = '22px 24px', children }: Props = $props();
</script>

<div class="sticky" style="transform: rotate({tilt}deg); padding: {padding}">
	{@render children()}
</div>

<style>
	.sticky {
		background: var(--gold-soft);
		box-shadow: var(--shadow);
		color: var(--ink);
	}
</style>
