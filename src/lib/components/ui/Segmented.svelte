<script lang="ts" generics="T extends string">
	/** Pill segmented toggle; active segment is ink with paper text. Uses aria-pressed. */
	interface Props {
		options: { value: T; label: string }[];
		value: T;
		label: string;
	}
	let { options, value = $bindable(), label }: Props = $props();
</script>

<div class="seg" role="group" aria-label={label}>
	{#each options as o (o.value)}
		<button type="button" aria-pressed={value === o.value} onclick={() => (value = o.value)}
			>{o.label}</button
		>
	{/each}
</div>

<style>
	.seg {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px;
		border-radius: 999px;
		background: var(--paper);
		border: 1px solid var(--line);
	}
	button {
		height: 40px;
		padding: 0 16px;
		border-radius: 999px;
		border: 0;
		background: transparent;
		color: var(--ink2);
		font: 600 14px var(--font-ui);
		cursor: pointer;
	}
	button[aria-pressed='true'] {
		background: var(--ink);
		color: var(--paper);
	}
</style>
