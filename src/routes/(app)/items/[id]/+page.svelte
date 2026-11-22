<script lang="ts">
	import { enhance, deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import ItemFields from '#lib/components/ItemFields.svelte';
	import { imageUrl } from '#lib/images';
	import { plural } from '#lib/format';
	import { slide } from '#lib/motion';

	let { data, form } = $props();

	// Keep ?list= on every form post so the back link still points at the list after saving.
	const listQuery = $derived(data.back ? `&list=${data.back}` : '');
	const backHref = $derived(data.back ? `/lists/${data.back}` : '/items');
	const backLabel = $derived(data.back ? (data.allLists.find((l) => l.id === data.back)?.title ?? 'Back') : 'All my items');
	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return u;
		}
	};

	let busy = $state(false);
	const busyEnhance = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};

	// ── Uploads (one file per request, so large batches don't hit body limits) ──
	let uploading = $state<{ done: number; total: number } | null>(null);
	let uploadErrors = $state<string[]>([]);
	let fileInput = $state<HTMLInputElement>();
	let dropping = $state(false);
	const remaining = $derived(10 - data.images.length);

	async function upload(files: FileList | File[]) {
		const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
		uploadErrors = [];
		if (!list.length) return;
		if (list.length > remaining) {
			uploadErrors = [`You can add ${plural(remaining, 'more picture')} to this item.`];
			list.splice(remaining);
		}
		uploading = { done: 0, total: list.length };
		for (const f of list) {
			const body = new FormData();
			body.set('file', f);
			const res = await fetch(`/api/items/${data.item.id}/images`, { method: 'POST', body });
			if (!res.ok) {
				const msg = (await res.json().catch(() => null))?.error ?? `${f.name} didn't upload.`;
				uploadErrors = [...uploadErrors, msg];
			}
			uploading = { done: uploading!.done + 1, total: list.length };
		}
		uploading = null;
		if (fileInput) fileInput.value = '';
		await invalidateAll();
	}

	// ── Picture order (drag, or arrow keys on a focused picture) ──
	// Writable $derived (not $state + $effect) so the pictures are in the server-rendered page too.
	let order = $derived(data.images.map((i) => i.id));
	const imgById = $derived(new Map(data.images.map((i) => [i.id, i])));
	let dragImg = $state<string | null>(null);

	async function saveOrder() {
		const body = new FormData();
		body.set('order', JSON.stringify(order));
		const res = await fetch('?/imageOrder', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
		deserialize(await res.text());
		await invalidateAll();
	}
	function move(id: string, to: number) {
		const next = order.filter((x) => x !== id);
		next.splice(Math.max(0, Math.min(to, next.length)), 0, id);
		order = next;
	}
	function onImgKey(e: KeyboardEvent, id: string) {
		const i = order.indexOf(id);
		if (e.key === 'ArrowLeft' && i > 0) move(id, i - 1);
		else if (e.key === 'ArrowRight' && i < order.length - 1) move(id, i + 1);
		else return;
		e.preventDefault();
		saveOrder();
		queueMicrotask(() => document.getElementById(`img-${id}`)?.focus());
	}

	let picked = $state<string[]>([]);
	$effect(() => {
		picked = form?.linkFound?.images?.slice(0, 1) ?? [];
	});
	let selectedLists = $state<string[]>([]);
	$effect(() => {
		selectedLists = [...data.onLists];
	});
</script>

<svelte:head><title>{data.item.title} — Wrappy</title></svelte:head>

<main class="container page">
	<a href={backHref} class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />{backLabel}</a>
	<h1 class="hand">Edit item</h1>
	{#if data.item.archivedAt}
		<div class="archived-note" role="status" in:slide>
			<p>
				<strong>Archived.</strong> It's hidden from your lists and from everyone else. Restore it to put it back where it was.
			</p>
			<form method="POST" action="?/restore{listQuery}" use:enhance={busyEnhance}>
				<button class="btn btn-dark btn-md" disabled={busy}>Restore</button>
			</form>
		</div>
	{/if}

	<div class="with-aside">
		<div class="main-col stack-lg">
			<Sheet tape margin={50} padding="32px 28px 28px 72px" class="sheet">
				<form method="POST" action="?/save{listQuery}" class="stack" use:enhance={busyEnhance}>
					<ItemFields values={data.item} />
					{#if form?.saveError}<p class="field-error" role="alert">{form.saveError}</p>{/if}
					<div class="row-actions">
						<button class="btn btn-dark btn-md" disabled={busy}>Save details</button>
						{#if form?.saved}<span class="meta" role="status">Saved.</span>{/if}
					</div>
				</form>
			</Sheet>

			<Sheet margin={50} padding="26px 28px 26px 72px" class="sheet">
				<div class="section-head">
					<h2 class="hand h2">Pictures</h2>
					<span class="meta">{data.images.length} of 10</span>
				</div>
				{#if data.images.length}
					<p class="meta hint">The first picture is the cover. Drag to reorder, or focus one and use the arrow keys.</p>
					<div class="pics" role="list">
						{#each order as id, i (id)}
							{@const img = imgById.get(id)}
							{#if img}
								<div
									class="pic"
									class:dragging={dragImg === id}
									role="listitem"
									draggable="true"
									ondragstart={() => (dragImg = id)}
									ondragover={(e) => {
										if (!dragImg || dragImg === id) return;
										e.preventDefault();
										move(dragImg, order.indexOf(id));
									}}
									ondragend={() => {
										if (dragImg) saveOrder();
										dragImg = null;
									}}
								>
									<button
										type="button"
										class="pic-btn"
										id="img-{id}"
										aria-label="Picture {i + 1} of {order.length}. Use left and right arrow keys to move it."
										onkeydown={(e) => onImgKey(e, id)}
									>
										<img src={imageUrl(img.storageKey, 'thumb')} alt="" />
									</button>
									{#if i === 0}<span class="cover-tag">cover</span>{/if}
									<div class="pic-actions">
										{#if i !== 0}
											<form method="POST" action="?/imageCover{listQuery}" use:enhance={busyEnhance}>
												<input type="hidden" name="imageId" value={id} />
												<button class="mini" disabled={busy}>Make cover</button>
											</form>
										{/if}
										<form method="POST" action="?/imageDelete{listQuery}" use:enhance={busyEnhance}>
											<input type="hidden" name="imageId" value={id} />
											<button class="mini" aria-label="Delete picture {i + 1}" disabled={busy}><Icon name="trash" size={15} /></button>
										</form>
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

				{#if remaining > 0}
					<label
						class="drop"
						class:on={dropping}
						ondragover={(e) => {
							if (dragImg) return;
							e.preventDefault();
							dropping = true;
						}}
						ondragleave={() => (dropping = false)}
						ondrop={(e) => {
							if (dragImg) return;
							e.preventDefault();
							dropping = false;
							if (e.dataTransfer?.files) upload(e.dataTransfer.files);
						}}
					>
						<input
							bind:this={fileInput}
							type="file"
							accept="image/*,.heic,.heif"
							multiple
							class="sr-only"
							onchange={(e) => e.currentTarget.files && upload(e.currentTarget.files)}
						/>
						<Icon name="plus" size={22} />
						<span class="write">
							{uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}…` : 'Add pictures'}
						</span>
						<span class="meta">Drop files here or choose from your phone or computer · up to 10 MB each</span>
					</label>
				{/if}
				{#each uploadErrors as err, i (i)}<p class="field-error" role="alert">{err}</p>{/each}
			</Sheet>

			<Sheet margin={50} padding="26px 28px 26px 72px" class="sheet">
				<h2 class="hand h2">Links</h2>
				<p class="meta hint">Add a few shops if you're happy with any of them.</p>
				{#if data.links.length}
					<ul class="links">
						{#each data.links as l (l.id)}
							<li>
								<a href={l.url} target="_blank" rel="noopener noreferrer" class="link"
									><Icon name="link" size={16} />{l.label || host(l.url)}</a
								>
								<form
									method="POST"
									action="?/removeLink{listQuery}"
									use:enhance={busyEnhance}
									onsubmit={(e) => {
										const hasPics = data.images.some((img) => img.linkId === l.id);
										const fd = e.currentTarget.querySelector('input[name=withImages]') as HTMLInputElement;
										fd.checked = hasPics && confirm('Also delete the pictures that came from this link?');
									}}
								>
									<input type="hidden" name="linkId" value={l.id} />
									<input type="checkbox" name="withImages" class="sr-only" tabindex="-1" aria-hidden="true" />
									<button class="btn btn-text" disabled={busy}>Remove</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}

				<form method="POST" action="?/addLink{listQuery}" class="add-link" use:enhance={busyEnhance}>
					<label for="link-url" class="sr-only">Shop link</label>
					<input id="link-url" name="url" class="line-input dashed" placeholder="Paste another shop link…" required autocomplete="off" />
					<button class="btn btn-dark btn-md" disabled={busy}>{busy ? 'Adding…' : 'Add link'}</button>
				</form>
				{#if form?.linkError}<p class="field-error" role="alert">{form.linkError}</p>{/if}

				{#if form?.linkFound}
					<div class="panel">
						{#if form.linkFound.failed}
							<p class="copy">Link saved. We couldn't read details from that page — add pictures and a price yourself.</p>
						{:else}
							{#if form.linkFound.price && form.linkFound.rawPrice !== data.item.price}
								<form method="POST" action="?/usePrice{listQuery}" class="use-price" use:enhance={busyEnhance}>
									<input type="hidden" name="price" value={form.linkFound.rawPrice} />
									<input type="hidden" name="currency" value={form.linkFound.currency ?? data.item.currency} />
									<span class="copy">This shop lists it at <strong>{form.linkFound.price}</strong>.</span>
									<button class="btn btn-outline" disabled={busy}>Use this price</button>
								</form>
							{/if}
							{#if form.linkFound.images.length && remaining > 0}
								<form method="POST" action="?/importImages{listQuery}" use:enhance={busyEnhance}>
									<input type="hidden" name="linkId" value={form.linkFound.linkId} />
									<p class="label">Choose pictures to keep</p>
									<div class="candidates">
										{#each form.linkFound.images as src (src)}
											<label class="candidate" class:on={picked.includes(src)}>
												<input type="checkbox" name="image" value={src} bind:group={picked} class="sr-only" />
												<img {src} alt="" referrerpolicy="no-referrer" loading="lazy" />
												<span class="tick"><Checkbox checked={picked.includes(src)} size={22} /></span>
											</label>
										{/each}
									</div>
									<button class="btn btn-primary" disabled={busy || !picked.length}>Save {plural(picked.length, 'picture')}</button>
								</form>
							{/if}
						{/if}
					</div>
				{/if}
				{#if form?.imported !== undefined}
					<p class="meta" role="status">
						{form.imported === form.wanted
							? `Saved ${plural(form.imported, 'picture')}.`
							: `Saved ${form.imported} of ${form.wanted} — the shop wouldn't let us copy the rest.`}
					</p>
				{/if}
			</Sheet>
		</div>

		<aside>
			<Sheet margin={false} padding="24px">
				<h2 class="hand h2">On your lists</h2>
				<form method="POST" action="?/lists{listQuery}" class="stack-sm" use:enhance={busyEnhance}>
					{#each data.allLists as l (l.id)}
						<label class="check-row">
							<input type="checkbox" name="listId" value={l.id} bind:group={selectedLists} class="sr-only" />
							<Checkbox checked={selectedLists.includes(l.id)} size={22} />
							<span class="write">{l.title}</span>
							{#if l.santa}<span class="meta">Santa · {l.santa}</span>{/if}
						</label>
					{:else}
						<p class="copy">You don't have any lists yet. <a href="/lists/new">Start one</a>.</p>
					{/each}
					{#if form?.listsError}<p class="field-error" role="alert">{form.listsError}</p>{/if}
					{#if data.allLists.length}
						<div class="row-actions">
							<button class="btn btn-dark" disabled={busy}>Update lists</button>
							{#if form?.listsSaved}<span class="meta" role="status">Updated.</span>{/if}
						</div>
					{/if}
				</form>
			</Sheet>

			<Sheet margin={false} padding="24px">
				<h2 class="hand h2">Good idea for…</h2>
				<p class="copy">Suggest who might like to get you this. Everyone sees the hint, and it's highlighted for them.</p>
				{#if data.people.length}
					<form method="POST" action="?/suggest{listQuery}" class="suggest" use:enhance={busyEnhance}>
						<label for="suggest" class="sr-only">Suggested person</label>
						<select id="suggest" name="userId" class="line-input select">
							<option value="">No one in particular</option>
							{#each data.people as p (p.id)}
								<option value={p.id} selected={data.suggestion?.userId === p.id}>{p.name}</option>
							{/each}
						</select>
						<button class="btn btn-outline" disabled={busy}>Save</button>
					</form>
				{:else}
					<p class="meta">Once you share a list, people who open it can be suggested here.</p>
				{/if}
			</Sheet>

			{#if !data.item.archivedAt}
				<form method="POST" action="?/archive{listQuery}">
					<button class="btn btn-text danger"><Icon name="archive" size={16} />Archive this item</button>
				</form>
			{/if}
			<form
				method="POST"
				action="?/delete{listQuery}"
				onsubmit={(e) => {
					const n = data.onLists.length;
					if (!confirm(n ? `Delete this item from ${plural(n, 'list')} and everywhere else?` : 'Delete this item?')) e.preventDefault();
				}}
			>
				<button class="btn btn-text danger"><Icon name="trash" size={16} />Delete this item everywhere</button>
			</form>
		</aside>
	</div>
</main>

<style>
	.archived-note {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 14px 18px;
		margin-bottom: 8px;
		background: var(--gold-soft);
		border-radius: 6px;
		font-size: 15px;
		line-height: 1.5;
	}
	.archived-note p {
		margin: 0;
		flex: 1 1 240px;
	}
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 20px;
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
	h1 {
		margin: 0 0 8px;
		font-size: 60px;
	}
	.stack-lg {
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.stack-sm {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 8px;
	}
	.section-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}
	.h2 {
		margin: 0 0 6px;
		font-size: 32px;
	}
	.hint {
		margin: 0 0 14px;
	}
	.copy {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.pics {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 12px;
		margin-bottom: 14px;
	}
	.pic {
		position: relative;
		aspect-ratio: 1;
		border-radius: 4px;
		overflow: hidden;
		background: var(--desk);
		cursor: grab;
	}
	.pic.dragging {
		opacity: 0.4;
	}
	.pic-btn {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: none;
		cursor: grab;
	}
	.pic img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.cover-tag {
		position: absolute;
		left: 6px;
		top: 4px;
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 18px;
		color: var(--on-gold);
		background: var(--gold);
		padding: 0 8px;
		border-radius: 3px;
	}
	.pic-actions {
		position: absolute;
		inset: auto 6px 6px 6px;
		display: flex;
		justify-content: space-between;
		gap: 6px;
	}
	.pic-actions form:only-child {
		margin-left: auto;
	}
	.mini {
		height: 30px;
		padding: 0 10px;
		border-radius: 999px;
		border: 0;
		background: var(--paper);
		color: var(--ink);
		font: 600 12px var(--font-ui);
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		box-shadow: var(--shadow);
	}
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 22px 16px;
		border: 2px dashed var(--line);
		border-radius: 4px;
		color: var(--ink2);
		text-align: center;
		cursor: pointer;
	}
	.drop.on,
	.drop:focus-within {
		border-color: var(--gold);
	}
	.drop .write {
		font-size: 22px;
	}
	.links {
		list-style: none;
		margin: 0 0 8px;
		padding: 0;
	}
	.links li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border-bottom: 1px solid var(--rule);
	}
	.link {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 15px;
		overflow-wrap: anywhere;
		text-underline-offset: 3px;
	}
	.add-link {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		flex-wrap: wrap;
	}
	.add-link input {
		flex: 1 1 220px;
		min-width: 0;
		font-size: 20px;
	}
	.panel {
		margin-top: 16px;
		padding: 18px 20px;
		background: var(--gold-soft);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.use-price {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}
	.use-price .copy {
		margin: 0;
	}
	.candidates {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
		gap: 10px;
		margin: 8px 0 12px;
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
	.check-row {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		border-bottom: 1px solid var(--rule);
		cursor: pointer;
	}
	.check-row:has(:focus-visible) {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}
	.check-row .write {
		flex: 1;
		font-size: 20px;
	}
	.suggest {
		display: flex;
		gap: 10px;
		align-items: flex-end;
	}
	.select {
		flex: 1;
		min-width: 0;
		font-family: var(--font-write);
		font-size: 20px;
	}
	.danger {
		color: var(--ink2);
		gap: 6px;
		margin-left: -8px;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 26px 16px 22px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
