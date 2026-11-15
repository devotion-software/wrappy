<script lang="ts">
	import { enhance } from '$app/forms';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { formatPrice, tiltFor } from '#lib/format';
	import type { ListItemView } from '#lib/server/lists';

	interface Props {
		item: ListItemView;
		listId: string;
		/** owner = editing own list; guest = friend view; preview = owner previewing the friend view. */
		mode: 'owner' | 'guest' | 'preview';
		signedIn: boolean;
		ownerName: string;
		claimError?: string | null;
		/** Drag-and-drop handle (owner mode only). */
		dragHandle?: import('svelte').Snippet;
	}
	let { item, listId, mode, signedIn, ownerName, claimError = null, dragHandle }: Props = $props();

	const claim = $derived(mode === 'preview' ? null : item.claim);
	const struck = $derived(!!claim && !claim.mine);
	const price = $derived(formatPrice(item.price, item.currency));
	const meta = $derived([item.notes, item.link?.host, price].filter(Boolean) as string[]);
	const detailHref = $derived(mode === 'owner' ? `/items/${item.id}?list=${listId}` : `/lists/${listId}/items/${item.id}`);
	const takenNote = $derived.by(() => {
		if (!claim || claim.mine) return '';
		const verb = claim.status === 'bought' ? 'bought' : 'reserved';
		return claim.byName ? `${verb} by ${claim.byName}` : verb;
	});
	let pending = $state(false);
	const submit = () => {
		pending = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = false;
		};
	};
</script>

<div class="row" class:has-handle={!!dragHandle}>
	{#if dragHandle}{@render dragHandle()}{/if}
	<Checkbox checked={!!claim} tilt={tiltFor(item.id)} />
	{#if item.cover}
		<a href={detailHref} class="thumb" tabindex="-1" aria-hidden="true">
			<img src={item.cover} alt="" loading="lazy" />
			{#if item.imageCount > 1}<span class="more">+{item.imageCount - 1}</span>{/if}
		</a>
	{/if}
	<div class="body">
		<div class="name-line">
			<a href={detailHref} class="write name" class:struck>{item.title}</a>
			{#if item.mostWanted}<Icon name="star" label="Most wanted" />{/if}
		</div>
		{#if meta.length}<p class="meta line">{meta.join(' · ')}</p>{/if}
		{#if item.suggestion}
			<p class="suggest" class:for-me={item.suggestion.forViewer}>
				{item.suggestion.forViewer
					? `${ownerName} thinks you'd be perfect to get this`
					: `idea for ${item.suggestion.name}`}
			</p>
		{/if}
	</div>

	<div class="actions">
		{#if mode === 'owner'}
			{#if claim}<span class="note">{takenNote}</span>{/if}
			{#if item.link}
				<a href={item.link.url} target="_blank" rel="noopener noreferrer" class="btn btn-icon" aria-label="Open in shop"
					><Icon name="link" /></a
				>
			{/if}
			<a href={detailHref} class="btn btn-icon" aria-label="Edit {item.title}"><Icon name="edit" /></a>
		{:else if mode === 'preview'}
			<span class="btn btn-outline" aria-disabled="true">I'll get it</span>
		{:else if !claim}
			{#if signedIn}
				<form method="POST" action="?/claim" use:enhance={submit}>
					<input type="hidden" name="itemId" value={item.id} />
					<button class="btn btn-outline" disabled={pending}>I'll get it</button>
				</form>
			{:else}
				<a class="btn btn-outline" href="/signin?next={encodeURIComponent(`/lists/${listId}`)}">I'll get it</a>
			{/if}
		{:else if claim.mine && claim.status === 'buying'}
			<span class="note">you're getting this</span>
			<form method="POST" action="?/bought" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-primary" disabled={pending}>Mark as bought</button>
			</form>
			<form method="POST" action="?/unclaim" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-text" disabled={pending}>Undo</button>
			</form>
		{:else if claim.mine}
			<span class="note">bought by you</span>
			<form method="POST" action="?/unclaim" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-text" disabled={pending}>Undo</button>
			</form>
		{:else}
			<span class="note">{takenNote}</span>
		{/if}
	</div>
	{#if claimError}<p class="field-error full" role="alert">{claimError}</p>{/if}
</div>

<style>
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 16px;
		padding: 16px 0;
		border-bottom: 1px solid var(--rule);
		background: var(--paper);
	}
	.thumb {
		position: relative;
		flex: none;
		width: 56px;
		height: 56px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--desk);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.more {
		position: absolute;
		right: 3px;
		bottom: 3px;
		padding: 1px 5px;
		border-radius: 999px;
		background: var(--paper);
		color: var(--ink);
		font-size: 11px;
		font-weight: 600;
	}
	.body {
		flex: 1 1 180px;
		min-width: 0;
	}
	@media (max-width: 520px) {
		.thumb {
			width: 48px;
			height: 48px;
		}
		.name {
			font-size: 22px;
		}
	}
	.name-line {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.name {
		margin: 0;
		font-size: 24px;
		line-height: 1.2;
		color: var(--ink);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.name:hover {
		text-decoration: underline;
		text-decoration-color: var(--line);
		text-underline-offset: 4px;
	}
	.name.struck {
		color: var(--faint);
		text-decoration: line-through;
		text-decoration-color: var(--gold);
		text-decoration-thickness: 2px;
	}
	.line {
		margin: 4px 0 0;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	.suggest {
		margin: 4px 0 0;
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 20px;
		color: var(--gold-text);
	}
	.suggest.for-me {
		display: inline-block;
		padding: 2px 10px;
		background: var(--gold-soft);
		transform: rotate(-0.6deg);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.actions form {
		display: contents;
	}
	.full {
		flex-basis: 100%;
	}
	span.btn[aria-disabled='true'] {
		cursor: default;
		opacity: 0.8;
	}
</style>
