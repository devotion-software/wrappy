<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import ItemRow from '#lib/components/ItemRow.svelte';
	import SharePanel from '#lib/components/SharePanel.svelte';
	import ListSettingsFields from '#lib/components/ListSettingsFields.svelte';
	import PasteList from '#lib/components/PasteList.svelte';
	import { CURRENCIES, formatDate, formatPrice, plural } from '#lib/format';
	import { flip, slide } from '#lib/motion';

	let { data, form } = $props();

	const mode = $derived(data.isOwner ? 'owner' : 'guest');
	const firstName = $derived(data.owner.name.split(' ')[0]);
	const isSanta = $derived(!!data.list.santaId);

	// Local order for drag-and-drop; re-synced whenever the server data changes.
	let order = $state<string[]>([]);
	$effect(() => {
		order = data.items.map((i) => i.id);
	});
	const byId = $derived(new Map(data.items.map((i) => [i.id, i])));
	const rows = $derived(order.map((id) => byId.get(id)).filter((i) => !!i));
	const mostWanted = $derived(data.items.filter((i) => i.mostWanted).length);

	let dragId = $state<string | null>(null);
	let armed = $state<string | null>(null);

	async function saveOrder() {
		const body = new FormData();
		body.set('order', JSON.stringify(order));
		const res = await fetch('?/reorder', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		deserialize(await res.text());
	}
	function moveTo(id: string, targetId: string, e: DragEvent) {
		if (id === targetId) return;
		const from = order.indexOf(id);
		const to = order.indexOf(targetId);
		// Only swap once the pointer is past the target's middle in the direction of travel. Rows glide
		// into place (animate:flip), so without this the target is still under the pointer mid-glide
		// and the two rows would swap back and forth.
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const mid = r.top + r.height / 2;
		if ((from < to && e.clientY < mid) || (from > to && e.clientY > mid)) return;
		const next = [...order];
		next.splice(from, 1);
		next.splice(to, 0, id);
		order = next;
	}
	function onHandleKey(e: KeyboardEvent, id: string) {
		const i = order.indexOf(id);
		const j = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
		if (j < 0 || j >= order.length) return;
		e.preventDefault();
		const next = [...order];
		[next[i], next[j]] = [next[j], next[i]];
		order = next;
		saveOrder();
		queueMicrotask(() => document.getElementById(`handle-${id}`)?.focus());
	}

	let busy = $state(false);
	const busyEnhance = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update();
			busy = false;
		};
	};

	let picked = $state<string[]>([]);
	$effect(() => {
		picked = form?.found?.images?.slice(0, 1) ?? [];
	});
	let settingsOpen = $state(false);
</script>

<svelte:head><title>{data.list.title} — Wrappy</title></svelte:head>

<main class="container page">
	{#if data.isOwner}
		<a href={isSanta ? `/santa/${data.list.santaId}` : '/lists'} class="back"
			><Icon name="arrow-left" size={16} strokeWidth={2} />{isSanta ? 'Back to Secret Santa' : 'All lists'}</a
		>
	{:else if data.owner.username}
		<a href="/u/{data.owner.username}" class="back"
			><Icon name="arrow-left" size={16} strokeWidth={2} />{data.owner.name}'s lists</a
		>
	{/if}

	<div class="title-row">
		<div>
			<h1 class="hand">{data.list.title}</h1>
			<p class="sub">
				{[
					data.isOwner ? 'Your list' : `${data.owner.name}'s list`,
					formatDate(data.list.eventDate),
					plural(data.items.length, 'item'),
					data.santa ? `Secret Santa${data.santa.limit ? `, up to ${data.santa.limit}` : ''}` : null
				]
					.filter(Boolean)
					.join(' · ')}
			</p>
		</div>
	</div>

	<div class="with-aside">
		<Sheet tape margin={50} padding="18px 28px 20px 72px" class="main-col list-sheet">
			{#if !data.isOwner}
				<p class="banner"><Icon name="lock" size={16} />{firstName} can't see what you reserve or buy.</p>
			{/if}

			{#if data.list.description}<p class="write description">{data.list.description}</p>{/if}

			<div class="rows">
				{#each rows as item (item.id)}
					<div
						class="drag-wrap"
						animate:flip
						in:slide
						out:slide
						class:dragging={dragId === item.id}
						draggable={mode === 'owner' && armed === item.id}
						role="listitem"
						ondragstart={(e) => {
							dragId = item.id;
							e.dataTransfer?.setData('text/plain', item.id);
						}}
						ondragover={(e) => {
							if (!dragId) return;
							e.preventDefault();
							moveTo(dragId, item.id, e);
						}}
						ondragend={() => {
							if (dragId) saveOrder();
							dragId = null;
							armed = null;
						}}
					>
						<ItemRow
							{item}
							listId={data.list.id}
							{mode}
							signedIn={!!data.user}
							ownerName={firstName}
							claimError={form?.claimError?.itemId === item.id ? form.claimError.message : null}
						>
							{#snippet dragHandle()}
								{#if mode === 'owner' && rows.length > 1}
									<button
										type="button"
										class="handle"
										id="handle-{item.id}"
										aria-label="Move {item.title} (use arrow keys)"
										onpointerdown={() => (armed = item.id)}
										onpointerup={() => (armed = null)}
										onkeydown={(e) => onHandleKey(e, item.id)}
									>
										<svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"
											><circle cx="4" cy="4" r="1.6" /><circle cx="10" cy="4" r="1.6" /><circle cx="4" cy="10" r="1.6" /><circle
												cx="10"
												cy="10"
												r="1.6"
											/><circle cx="4" cy="16" r="1.6" /><circle cx="10" cy="16" r="1.6" /></svg
										>
									</button>
								{/if}
							{/snippet}
						</ItemRow>
					</div>
				{:else}
					<p class="empty">
						{#if data.isOwner}
							Nothing here yet. Paste a shop link or write an item below.
						{:else}
							{firstName} hasn't added any items yet.
						{/if}
					</p>
				{/each}
			</div>

			{#if data.isOwner}
				{#if form?.found}
					<div class="panel" in:slide>
						<p class="hand panel-title">Found it</p>
						<p class="write found-name">{form.found.title}{form.found.price ? ` · ${form.found.price}` : ''}</p>
						{#if form.found.images.length}
							<form method="POST" action="?/importImages" use:enhance={busyEnhance}>
								<input type="hidden" name="itemId" value={form.found.itemId} />
								<input type="hidden" name="linkId" value={form.found.linkId} />
								<p class="label">Choose pictures to keep</p>
								<div class="candidates">
									{#each form.found.images as src (src)}
										<label class="candidate" class:on={picked.includes(src)}>
											<input type="checkbox" name="image" value={src} bind:group={picked} class="sr-only" />
											<img {src} alt="" referrerpolicy="no-referrer" loading="lazy" />
											<span class="tick"><Checkbox checked={picked.includes(src)} size={22} /></span>
										</label>
									{/each}
								</div>
								<div class="panel-actions">
									<button class="btn btn-primary" disabled={busy || !picked.length}
										>Save {plural(picked.length, 'picture')}</button
									>
									<a href="/items/{form.found.itemId}?list={data.list.id}" class="btn btn-text">Edit details</a>
								</div>
							</form>
						{:else}
							<div class="panel-actions">
								<a href="/items/{form.found.itemId}?list={data.list.id}" class="btn btn-outline">Edit details</a>
							</div>
						{/if}
					</div>
				{:else if form?.imported !== undefined}
					<p class="meta ok" role="status">
						{form.imported === form.wanted
							? `Saved ${plural(form.imported, 'picture')}.`
							: `Saved ${form.imported} of ${form.wanted} pictures — the shop wouldn't let us copy the rest.`}
					</p>
				{/if}

				{#if form?.manualUrl !== undefined && form?.manualUrl !== null}
					<form method="POST" action="?/addManual" class="panel" use:enhance={busyEnhance} in:slide>
						<p class="hand panel-title">Add the details</p>
						<p class="copy">We couldn't read that page, so fill in what you know. The link is saved with it.</p>
						<input type="hidden" name="url" value={form.manualUrl} />
						<div class="field">
							<label for="m-title">Name</label>
							<input id="m-title" name="title" class="line-input" required maxlength="200" />
						</div>
						<div class="price-row">
							<div class="field grow">
								<label for="m-price">Price <span class="opt">(optional)</span></label>
								<input id="m-price" name="price" class="line-input" inputmode="decimal" placeholder="24.99" />
							</div>
							<div class="field">
								<label for="m-cur">Currency</label>
								<select id="m-cur" name="currency" class="line-input select">
									{#each CURRENCIES as c (c)}<option value={c}>{c}</option>{/each}
								</select>
							</div>
						</div>
						{#if form.manualError}<p class="field-error" role="alert">{form.manualError}</p>{/if}
						<div class="panel-actions"><button class="btn btn-dark" disabled={busy}>Add item</button></div>
					</form>
				{/if}

				<form method="POST" action="?/addWish" class="add-line" use:enhance={busyEnhance}>
						<Icon name="plus" size={24} strokeWidth={2} />
						<label for="newwish" class="sr-only">Add an item</label>
						<input
							id="newwish"
							name="wish"
							class="line-input dashed add-input"
							placeholder="Paste a shop link or write an item…"
							autocomplete="off"
							maxlength="2048"
						/>
						<button class="btn btn-dark btn-md" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
					</form>
				{#if form?.addError}<p class="field-error" role="alert">{form.addError}</p>{/if}

				<PasteList target={data.list.title} />

				{#if data.owned?.library.length}
					<details class="existing">
						<summary class="btn btn-text">Add from your other items ({data.owned.library.length})</summary>
						<form method="POST" action="?/addExisting" use:enhance={busyEnhance}>
							<div class="lib">
								{#each data.owned.library as it (it.id)}
									<label class="lib-row">
										<input type="checkbox" name="itemId" value={it.id} />
										<span class="write">{it.title}</span>
										<span class="meta">{formatPrice(it.price, it.currency) ?? ''}</span>
									</label>
								{/each}
							</div>
							<button class="btn btn-dark" disabled={busy}>Add to this list</button>
						</form>
					</details>
				{/if}
			{/if}
		</Sheet>

		<aside>
			{#if data.isOwner && data.owned}
				{#if !isSanta}
					<SharePanel
						visibility={data.list.visibility}
						shareToken={data.owned.shareToken}
						shares={data.owned.shares}
						viewers={data.owned.viewers}
						ownerUsername={data.owner.username}
						shareError={form?.shareError}
					/>
				{:else}
					<Sheet margin={false} padding="24px">
						<h2 class="hand h2">Secret Santa list</h2>
						<p class="copy">Only whoever draws your name will see this list.{data.santa?.limit ? ` Items with a price need to be ${data.santa.limit} or less.` : ''}</p>
					</Sheet>
				{/if}

				<Sheet margin={false} padding="8px 24px">
					<div class="setting"><span>Event date</span><strong>{formatDate(data.list.eventDate) ?? 'None'}</strong></div>
					<div class="setting">
						<span>Who can see it</span><strong
							>{isSanta ? 'Your Secret Santa' : data.list.visibility === 'public' ? 'Anyone (public)' : 'People you share with'}</strong
						>
					</div>
					<div class="setting">
						<span>Most wanted</span><strong class="star"><Icon name="star" size={14} />{plural(mostWanted, 'item')}</strong>
					</div>
					<div class="setting last">
						<button class="btn btn-text edit-btn" onclick={() => (settingsOpen = !settingsOpen)} aria-expanded={settingsOpen}
							>{settingsOpen ? 'Close settings' : 'Edit list'}</button
						>
					</div>
					{#if settingsOpen}
						<div transition:slide>
						<form method="POST" action="?/settings" class="settings" use:enhance={busyEnhance}>
							<ListSettingsFields values={data.list} hasUsername={data.owned.hasUsername} />
							{#if form?.settingsError}<p class="field-error" role="alert">{form.settingsError}</p>{/if}
							<button class="btn btn-dark" disabled={busy}>Save changes</button>
						</form>
						{#if !isSanta}
							<form
								method="POST"
								action="?/deleteList"
								class="danger"
								onsubmit={(e) => {
									if (!confirm(`Delete "${data.list.title}"? Your items stay in All my items.`)) e.preventDefault();
								}}
							>
								<button class="btn btn-text">Delete this list</button>
							</form>
						{/if}
						</div>
					{/if}
				</Sheet>

				<a href="/gifts" class="aside-link write"><Icon name="tick" size={20} />Opened your presents? Mark who they were from</a>
			{:else}
				<Sheet margin={false} padding="24px">
					<h2 class="hand h2">How this works</h2>
					<p class="copy">
						Tap <strong>I'll get it</strong> to reserve a gift so nobody else buys it, then mark it as bought. {firstName} never sees
						what's been reserved.
					</p>
					{#if !data.user}
						<a href="/signin?next=/lists/{data.list.id}" class="btn btn-primary btn-md signin">Log in to reserve gifts</a>
					{/if}
				</Sheet>
			{/if}
		</aside>
	</div>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.back {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		color: var(--ink2);
		text-decoration: none;
		min-height: 44px;
	}
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
	}
	h1 {
		margin: 0;
		font-size: 68px;
		line-height: 0.95;
		overflow-wrap: anywhere;
	}
	.sub {
		margin: 10px 0 0;
		font-size: 15px;
		color: var(--ink2);
	}
	.banner {
		margin: 8px 0 6px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		color: var(--ink2);
	}
	.description {
		margin: 8px 0 4px;
		font-size: 20px;
		color: var(--ink2);
		white-space: pre-line;
	}
	.empty {
		margin: 0;
		padding: 24px 0;
		font-size: 15px;
		color: var(--ink2);
		border-bottom: 1px solid var(--rule);
	}
	.drag-wrap.dragging {
		opacity: 0.5;
	}
	.drag-wrap.dragging :global(.row) {
		background: var(--gold-soft);
	}
	.drag-wrap :global(.row) {
		position: relative;
	}
	.handle {
		position: absolute;
		left: -63px; /* centred in the 50px margin: 25 − 72 padding − 16 half-width */
		top: 50%;
		transform: translateY(-50%);
		width: 32px;
		height: 44px;
		border: 0;
		background: transparent;
		color: var(--line);
		cursor: grab;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: none;
	}
	.handle:hover,
	.handle:focus-visible {
		color: var(--ink2);
	}
	/* Only show the handle when its row is hovered (or it has keyboard focus / is mid-drag).
	   Touch screens can't hover, so they always show it. */
	@media (hover: hover) {
		.handle {
			opacity: 0;
			transition: opacity 0.15s;
		}
		.drag-wrap:hover .handle,
		.drag-wrap.dragging .handle,
		.handle:focus-visible {
			opacity: 1;
		}
	}
	.add-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		padding: 18px 0 6px;
		color: var(--ink2);
	}
	.add-input {
		flex: 1 1 260px;
		min-width: 0;
	}
	.panel {
		margin: 18px 0 4px;
		padding: 20px 22px;
		background: var(--gold-soft);
		transform: rotate(-0.4deg);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.panel-title {
		margin: 0;
		font-size: 34px;
	}
	.found-name {
		margin: -6px 0 0;
		font-size: 22px;
	}
	.copy {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.candidates {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 10px;
		margin: 8px 0 4px;
	}
	.candidate {
		position: relative;
		aspect-ratio: 1;
		border-radius: 4px;
		overflow: hidden;
		background: var(--paper);
		cursor: pointer;
		outline: 2px solid transparent;
	}
	.candidate.on {
		outline-color: var(--gold);
	}
	.candidate:has(:focus-visible) {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}
	.candidate img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.tick {
		position: absolute;
		left: 6px;
		top: 6px;
		background: var(--paper);
		border-radius: 3px;
		display: flex;
	}
	.panel-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.price-row {
		display: flex;
		gap: 16px;
		align-items: flex-end;
	}
	.grow {
		flex: 1;
	}
	.select {
		font-family: var(--font-ui);
		font-size: 16px;
		min-width: 90px;
	}
	.opt {
		font-weight: 400;
		color: var(--muted);
	}
	.ok {
		margin: 12px 0 0;
	}
	.existing {
		margin-top: 8px;
	}
	.existing summary {
		list-style: none;
		padding-left: 0;
		cursor: pointer;
	}
	.existing summary::-webkit-details-marker {
		display: none;
	}
	.existing form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		align-items: flex-start;
	}
	.lib {
		width: 100%;
		max-height: 320px;
		overflow: auto;
	}
	.lib-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--rule);
		cursor: pointer;
	}
	.lib-row input {
		width: 18px;
		height: 18px;
		accent-color: var(--gold);
	}
	.lib-row .write {
		flex: 1;
		font-size: 20px;
	}
	aside .h2 {
		margin: 0 0 12px;
		font-size: 32px;
	}
	.setting {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
		font-size: 14px;
	}
	.setting span {
		color: var(--ink2);
		white-space: nowrap;
	}
	.setting strong {
		text-align: right;
	}
	.setting.last {
		border-bottom: 0;
		padding: 6px 0;
	}
	.star {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.edit-btn {
		margin-left: -8px;
	}
	.settings {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 8px 0 16px;
		align-items: flex-start;
	}
	.settings :global(.field) {
		width: 100%;
	}
	.danger {
		padding-bottom: 12px;
	}
	.danger .btn {
		margin-left: -8px;
	}
	.aside-link {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--ink2);
		text-decoration: none;
		font-size: 20px;
		padding: 4px;
	}
	.signin {
		margin-top: 16px;
	}

	@media (max-width: 600px) {
		h1 {
			font-size: 54px;
		}
		.page :global(.list-sheet) {
			padding: 14px 16px 16px 40px !important;
		}
		.page :global(.list-sheet > .margin) {
			left: 24px !important;
		}
		.handle {
			left: -42px; /* centred in the 24px margin: 12 − 40 padding − 14 half-width */
			width: 28px;
		}
	}
</style>
