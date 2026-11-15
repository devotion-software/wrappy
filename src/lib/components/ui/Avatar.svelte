<script lang="ts">
	/** Initials on --desk. `ring` adds the 2px paper ring used in overlapping stacks. */
	interface Props {
		name: string;
		size?: number;
		ring?: boolean;
	}
	let { name, size = 40, ring = false }: Props = $props();
	const initial = $derived((name.trim()[0] ?? '?').toUpperCase());
</script>

<span
	class="avatar"
	class:ring
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
</style>
