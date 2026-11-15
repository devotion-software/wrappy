<script lang="ts">
	/**
	 * Initials on --desk. `ring` adds the 2px paper ring used in overlapping stacks.
	 * `onDesk` uses a paper fill + shadow so it shows up when placed straight on the page background.
	 */
	interface Props {
		name: string;
		size?: number;
		ring?: boolean;
		onDesk?: boolean;
	}
	let { name, size = 40, ring = false, onDesk = false }: Props = $props();
	const initial = $derived((name.trim()[0] ?? '?').toUpperCase());
</script>

<span
	class="avatar"
	class:ring
	class:on-desk={onDesk}
	style="width: {size}px; height: {size}px; font-size: {Math.round(size * 0.36)}px"
	title={name}>{initial}</span
>

<style>
	.avatar {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 999px;
		background: var(--desk);
		font-weight: 600;
		color: var(--ink);
	}
	.ring {
		border: 2px solid var(--paper);
	}
	.on-desk {
		background: var(--paper);
		box-shadow: var(--shadow);
	}
</style>
