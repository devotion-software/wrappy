<script lang="ts">
	interface Props {
		href?: string;
		size?: 'sm' | 'md';
	}
	let { href = '/', size = 'md' }: Props = $props();
</script>

<a {href} class="logo {size}">
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="var(--gold)"
		stroke-width="2.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"><path d="M4 13c2 1.5 3.5 3.5 4.5 5.5C11 12 15 7 21 3" /></svg
	>
	<span>wishlist</span>
</a>

<style>
	.logo {
		display: flex;
		align-items: center;
		gap: 8px;
		text-decoration: none;
		color: var(--ink);
	}
	span {
		font-family: var(--font-hand);
		font-weight: 700;
		line-height: 1;
		font-size: 34px;
	}
	svg {
		width: 26px;
		height: 26px;
	}
	.sm span {
		font-size: 32px;
	}
	.sm svg {
		width: 24px;
		height: 24px;
	}
</style>
