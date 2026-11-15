<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	/**
	 * A sheet of notebook paper: paper background, 4px radius, soft shadow,
	 * gold margin line down the left, optional strip of tape and slight tilt.
	 */
	interface Props extends HTMLAttributes<HTMLElement> {
		/** Distance of the gold margin line from the left edge (px). false = no margin line. */
		margin?: number | false;
		tape?: boolean;
		/** Degrees of rotation, −1.5 to +1.2 per the design. */
		tilt?: number;
		/** Padding shorthand; left padding defaults to margin + 22px. */
		padding?: string;
		as?: 'section' | 'div' | 'article' | 'a';
		href?: string;
		children: Snippet;
	}
	let {
		margin = 50,
		tape = false,
		tilt = 0,
		padding,
		as = 'section',
		href,
		children,
		class: klass = '',
		style = '',
		...rest
	}: Props = $props();

	const pad = $derived(
		padding ?? (margin === false ? '24px' : `24px 28px 24px ${(margin as number) + 22}px`)
	);
</script>

<svelte:element
	this={as}
	{href}
	class="sheet {klass}"
	style="padding: {pad}; {tilt ? `transform: rotate(${tilt}deg);` : ''} {style}"
	{...rest}
>
	{#if margin !== false}<div class="margin" style="left: {margin}px" aria-hidden="true"></div>{/if}
	{#if tape}<div class="tape" aria-hidden="true"></div>{/if}
	{@render children()}
</svelte:element>

<style>
	.sheet {
		position: relative;
		display: block;
		background: var(--paper);
		border-radius: 4px;
		box-shadow: var(--shadow);
		color: var(--ink);
		text-decoration: none;
	}
	.margin {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--gold);
	}
	.tape {
		position: absolute;
		top: -11px;
		left: 50%;
		width: 110px;
		height: 24px;
		margin-left: -55px;
		background: var(--tape);
		transform: rotate(-3deg);
	}
</style>
