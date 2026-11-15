<script lang="ts">
	/**
	 * Hand-drawn checkbox: 1.5px ink square, slightly rotated, gold tick when checked.
	 * Purely visual — wrap it in a <button> or <label> for interaction.
	 */
	interface Props {
		checked?: boolean;
		size?: number;
		/** Rotation in degrees (−3 to +2.5). Pass a stable value per row. */
		tilt?: number;
	}
	let { checked = false, size = 24, tilt = 0 }: Props = $props();
</script>

<span
	class="box"
	style="width: {size}px; height: {size}px; transform: rotate({tilt}deg)"
	aria-hidden="true"
>
	{#if checked}
		<svg
			width={size - 4}
			height={size - 4}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-linejoin="round"><path d="M4 13c2 1.5 3.5 3.5 4.5 5.5C11 12 15 7 21 3" /></svg
		>
	{/if}
</span>

<style>
	.box {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1.5px solid var(--ink);
		border-radius: 3px;
		color: var(--gold);
	}
</style>
