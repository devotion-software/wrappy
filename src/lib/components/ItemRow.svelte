<script lang="ts">
	import { enhance } from '$app/forms';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { formatPrice, plural, tiltFor } from '#lib/format';
	import type { ListItemView } from '#lib/server/lists';
	import { writeIn, reducedMotion } from '#lib/motion';

	interface Props {
		item: ListItemView;
		listId: string;
		/** owner = editing own list; guest = someone else viewing it. */
		mode: 'owner' | 'guest';
		signedIn: boolean;
		ownerName: string;
		claimError?: string | null;
		/** Drag-and-drop handle (owner mode only). */
		dragHandle?: import('svelte').Snippet;
	}
	let { item, listId, mode, signedIn, ownerName, claimError = null, dragHandle }: Props = $props();

	const claims = $derived(item.claims);
	const mine = $derived(claims.mine);
	const others = $derived(claims.others);
	const group = $derived(claims.group);
	const single = $derived(claims.quantity === 1 && !group);
	const money = (v: string | null | undefined) => formatPrice(v ?? '0', item.currency) ?? '';
	/** Group gift progress for guests: "£30 of £80 chipped in". */
	const progress = $derived(group && group.pledged !== null ? `${money(group.pledged)} of ${money(group.target)} chipped in` : '');
	const left = $derived(group?.pledged != null ? Math.max(0, Number(group.target) - Number(group.pledged)) : 0);
	const chippers = $derived(
		group && mode === 'guest'
			? others.map((c) => `${c.byName ?? 'someone'} ${money(c.amount)}`).join(' · ')
			: ''
	);
	let amount = $state('');
	/** The box is ticked once it's taken: by you, or (for the owner) by someone they've revealed. */
	const ticked = $derived(!!mine || claims.full || (mode === 'owner' && others.length > 0 && (single || !!group)));
	const struck = $derived(!mine && (claims.full || (mode === 'owner' && single && others.length > 0)));
	const price = $derived(formatPrice(item.price, item.currency));
	const wanted = $derived(
		group ? 'group gift' : claims.quantity === null ? 'more than one is fine' : claims.quantity > 1 ? `wants ${claims.quantity}` : null
	);
	const meta = $derived([item.notes, item.link?.host, price, wanted].filter(Boolean) as string[]);
	const detailHref = $derived(mode === 'owner' ? `/items/${item.id}?list=${listId}` : `/lists/${listId}/items/${item.id}`);
	const takenNote = $derived.by(() => {
		if (group) {
			if (mode === 'owner') return others.length ? `from ${others.map((c) => c.byName).join(', ')}` : '';
			return claims.full ? 'all chipped in' : progress;
		}
		if (!others.length) return '';
		if (single || mode === 'owner') {
			// One claimer, or the owner's revealed (bought) ones: say who where we can.
			const named = others.filter((c) => c.byName).map((c) => c.byName);
			const verb = others[0].status === 'bought' ? 'bought' : 'reserved';
			if (single) return named.length ? `${verb} by ${named[0]}` : verb;
			return `bought by ${named.join(', ')}`;
		}
		const taken = others.length + (mine ? 1 : 0);
		return claims.quantity === null ? `${plural(taken, 'person', 'people')} getting this` : `${taken} of ${claims.quantity} taken`;
	});
	let pending = $state(false);
	/** Bumped on a successful claim / mark-as-bought to replay the celebration burst. */
	let burst = $state(0);
	const submit = ({ action }: { action: URL }) => {
		pending = true;
		return async ({ result, update }: { result: { type: string }; update: () => Promise<void> }) => {
			await update();
			pending = false;
			if (result.type === 'success' && /[?&]\/(claim|bought|chipIn)\b/.test(action.search) && !reducedMotion()) burst++;
			if (result.type === 'success') amount = '';
		};
	};
	const sparks = Array.from({ length: 8 }, (_, i) => i * 45);
</script>

<div class="row" class:has-handle={!!dragHandle}>
	{#if dragHandle}{@render dragHandle()}{/if}
	<!-- On your own list the box only means "someone's claimed this", so leave it out until then. -->
	<span class="check" class:unclaimed={mode === 'owner' && !others.length}>
		<Checkbox checked={ticked} tilt={tiltFor(item.id)} />
		{#key burst}
			{#if burst}
				<span class="burst" aria-hidden="true">
					{#each sparks as deg (deg)}<i style="--a: {deg}deg"></i>{/each}
				</span>
			{/if}
		{/key}
	</span>
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
		{#if chippers}<p class="meta line chippers">{chippers}</p>{/if}
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
			{#if takenNote}<span class="note" in:writeIn>{takenNote}</span>{/if}
			{#if item.link}
				<a href={item.link.url} target="_blank" rel="noopener noreferrer" class="btn btn-icon" aria-label="Open in shop"
					><Icon name="link" /></a
				>
			{/if}
			<a href={detailHref} class="btn btn-icon" aria-label="Edit {item.title}"><Icon name="edit" /></a>
		{:else if group && !mine && !claims.full}
			{#if takenNote}<span class="note" in:writeIn>{takenNote}</span>{/if}
			{#if signedIn}
				<form method="POST" action="?/chipIn" class="chip" use:enhance={submit}>
					<input type="hidden" name="itemId" value={item.id} />
					<label for="chip-{item.id}" class="sr-only">How much will you chip in towards {item.title}?</label>
					<input
						id="chip-{item.id}"
						name="amount"
						class="line-input amount"
						inputmode="decimal"
						placeholder={left ? String(left) : '20'}
						bind:value={amount}
						autocomplete="off"
					/>
					<button class="btn btn-outline" disabled={pending || !amount.trim()}>Chip in</button>
				</form>
			{:else}
				<a class="btn btn-outline" href="/signin?next={encodeURIComponent(`/lists/${listId}`)}">Chip in</a>
			{/if}
		{:else if !mine && !claims.full}
			{#if takenNote}<span class="note" in:writeIn>{takenNote}</span>{/if}
			{#if signedIn}
				<form method="POST" action="?/claim" use:enhance={submit}>
					<input type="hidden" name="itemId" value={item.id} />
					<button class="btn btn-outline" disabled={pending}>I'll get it</button>
				</form>
			{:else}
				<a class="btn btn-outline" href="/signin?next={encodeURIComponent(`/lists/${listId}`)}">I'll get it</a>
			{/if}
		{:else if mine?.status === 'buying'}
			<span class="note" in:writeIn>{group ? `you're chipping in ${money(mine.amount)}` : "you're getting this"}</span>
			<form method="POST" action="?/bought" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-primary" disabled={pending}>Mark as bought</button>
			</form>
			<form method="POST" action="?/unclaim" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-text" disabled={pending}>Undo</button>
			</form>
		{:else if mine}
			<span class="note" in:writeIn>{group ? `you put in ${money(mine.amount)}` : 'bought by you'}</span>
			<form method="POST" action="?/unclaim" use:enhance={submit}>
				<input type="hidden" name="itemId" value={item.id} />
				<button class="btn btn-text" disabled={pending}>Undo</button>
			</form>
		{:else}
			<span class="note" in:writeIn>{takenNote}</span>
		{/if}
	</div>
	{#if claimError}<p class="field-error full" role="alert">{claimError}</p>{/if}
</div>

<style>
	.chip {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.amount {
		width: 72px;
		height: 40px;
		font-size: 18px;
	}
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
	/* Strike-through drawn as a background line so it can sweep across when an item is taken. */
	.name {
		background: linear-gradient(var(--gold), var(--gold)) no-repeat 0 58% / 0% 2px;
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
		transition:
			background-size 0.45s cubic-bezier(0.65, 0, 0.35, 1),
			color 0.3s;
	}
	.name.struck {
		color: var(--faint);
		background-size: 100% 2px;
	}
	.name.struck:hover {
		text-decoration: none;
	}
	.check {
		position: relative;
		display: inline-flex;
		flex: none;
	}
	.check.unclaimed {
		display: none;
	}
	/* Eight gold sparks fly out from the checkbox, then fade. */
	.burst {
		position: absolute;
		inset: 50% auto auto 50%;
		pointer-events: none;
	}
	.burst i {
		position: absolute;
		left: -2px;
		top: -2px;
		width: 4px;
		height: 9px;
		border-radius: 2px;
		background: var(--gold);
		opacity: 0;
		transform: rotate(var(--a)) translateY(0);
		animation: spark 0.75s cubic-bezier(0.2, 0.7, 0.3, 1) forwards;
	}
	@keyframes spark {
		0% {
			opacity: 1;
			transform: rotate(var(--a)) translateY(-8px) scaleY(1);
		}
		100% {
			opacity: 0;
			transform: rotate(var(--a)) translateY(-28px) scaleY(0.5);
		}
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
</style>
