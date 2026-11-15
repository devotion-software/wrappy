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
	}
	let { card, showSharing = false }: Props = $props();

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

<a href="/lists/{card.id}" class="card" style="transform: rotate({tilt}deg)">
	<div class="margin" aria-hidden="true"></div>
	<p class="hand title">{card.title}</p>
	<p class="meta sub">
		{#if card.ownerName}{card.ownerName} ·
		{/if}{plural(card.count, 'wish', 'wishes')} · {formatDate(card.eventDate) ?? 'no date'}
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
