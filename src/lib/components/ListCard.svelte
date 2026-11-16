<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { formatDate, plural, tiltFor } from '#lib/format';

	interface Props {
		card: {
			id: string;
			title: string;
			eventDate: string | null;
			visibility: 'public' | 'private';
			santaId: string | null;
			count: number;
			preview: string[];
			sharedWith: number;
			ownerName?: string;
		};
		/** Show the sharing line (only meaningful for your own lists). */
		showSharing?: boolean;
		/** Position in its grid; staggers the entrance animation. */
		index?: number;
	}
	let { card, showSharing = false, index }: Props = $props();

	const tilt = $derived(tiltFor(card.id) / 5);
	const sharing = $derived(
		card.santaId
			? { icon: 'lock' as const, text: 'Secret Santa list' }
			: card.visibility === 'public'
				? { icon: 'globe' as const, text: 'On your profile' }
				: card.sharedWith > 0
					? { icon: 'users' as const, text: `Shared with ${plural(card.sharedWith, 'person', 'people')}` }
					: { icon: 'lock' as const, text: 'Only you' }
	);
</script>

<a href="/lists/{card.id}" class="card" class:rise={index !== undefined} style="--tilt: {tilt}deg; --i: {index ?? 0}">
	<div class="margin" aria-hidden="true"></div>
	<p class="hand title">{card.title}</p>
	<p class="meta sub">
		{#if card.ownerName}{card.ownerName} ·
		{/if}{plural(card.count, 'item')} · {formatDate(card.eventDate) ?? 'no date'}
	</p>
	{#each card.preview as p, i (i)}
		<p class="write line">{p}</p>
	{/each}
	{#if showSharing}
		<p class="share"><Icon name={sharing.icon} size={15} />{sharing.text}</p>
	{/if}
</a>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-height: 250px;
		padding: 24px 22px 20px 46px;
		background: var(--paper);
		border-radius: 4px;
		box-shadow: var(--shadow);
		text-decoration: none;
		color: var(--ink);
		transform: rotate(var(--tilt));
		transition:
			transform 0.25s cubic-bezier(0.3, 0.7, 0.4, 1),
			box-shadow 0.25s;
	}
	/* Picked up off the desk: straightens, lifts, shadow deepens. */
	.card:hover,
	.card:focus-visible {
		transform: rotate(0deg) translateY(-4px);
		box-shadow:
			var(--shadow),
			0 14px 28px -10px rgba(0, 0, 0, 0.18);
	}
	.card:active {
		transform: rotate(0deg) translateY(-1px);
		transition-duration: 0.08s;
	}
	.margin {
		position: absolute;
		left: 30px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--gold);
	}
	.title {
		margin: 0;
		font-size: 34px;
		overflow-wrap: anywhere;
	}
	.sub {
		margin: 0 0 10px;
	}
	.line {
		margin: 0;
		padding: 5px 0;
		border-bottom: 1px solid var(--rule);
		font-size: 19px;
		color: var(--ink2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.share {
		margin: auto 0 0;
		padding-top: 12px;
		font-size: 13px;
		color: var(--ink2);
		display: flex;
		align-items: center;
		gap: 6px;
	}
</style>
