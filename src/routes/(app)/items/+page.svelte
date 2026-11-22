<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import PasteList from '#lib/components/PasteList.svelte';
	import { formatPrice, plural } from '#lib/format';

	import { enhance } from '$app/forms';
	import { slide } from '#lib/motion';

	let { data, form } = $props();
	let q = $state('');
	const active = $derived(data.items.filter((i) => !i.archived));
	const archived = $derived(data.items.filter((i) => i.archived));
	const shown = $derived(q.trim() ? active.filter((i) => i.title.toLowerCase().includes(q.trim().toLowerCase())) : active);
	const undone = $derived(form?.restored && form.restored === data.justArchived?.id);
</script>

<svelte:head><title>All my items — Wrappy</title></svelte:head>

<main class="container page">
	<div class="title-row">
		<div>
			<h1 class="hand">All my items</h1>
			<p class="sub">Every item you've written, and the lists it's on. Edit it once and it changes everywhere.</p>
		</div>
		<a href="/items/new" class="btn btn-primary btn-md"><Icon name="plus" strokeWidth={2.2} />New item</a>
	</div>

	<div class="tools">
		<PasteList />
		<a href="/add" class="btn btn-text add-anywhere"><Icon name="link" />Add from any shop</a>
	</div>

	{#if data.justArchived && !undone}
		<div class="note" role="status" in:slide>
			<p><strong>{data.justArchived.title}</strong> is archived. It's hidden everywhere until you restore it.</p>
			<form method="POST" action="?/restore" use:enhance>
				<input type="hidden" name="itemId" value={data.justArchived.id} />
				<button class="btn btn-outline btn-md">Undo</button>
			</form>
		</div>
	{/if}

	<Sheet margin={50} padding="14px 28px 20px 72px" class="sheet">
		{#if active.length > 6}
			<div class="search">
				<label for="q" class="sr-only">Search your items</label>
				<input id="q" class="line-input dashed" placeholder="Search…" bind:value={q} />
			</div>
		{/if}
		{#each shown as it (it.id)}
			<a href="/items/{it.id}" class="row">
				{#if it.cover}<img src={it.cover} alt="" class="thumb" loading="lazy" />{:else}<span class="thumb empty"></span>{/if}
				<span class="body">
					<span class="write name"
						>{it.title}{#if it.mostWanted}&nbsp;<Icon name="star" size={16} label="Most wanted" />{/if}</span
					>
					<span class="meta"
						>{[formatPrice(it.price, it.currency), it.lists.length ? `On ${it.lists.map((l) => l.title).join(', ')}` : 'Not on a list yet']
							.filter(Boolean)
							.join(' · ')}</span
					>
				</span>
				<Icon name="edit" />
			</a>
		{:else}
			<p class="empty-copy">
				{active.length ? 'Nothing matches that search.' : 'No items yet. Add one here, paste a list, or add them from any of your lists.'}
			</p>
		{/each}
	</Sheet>
	<p class="meta">{plural(active.length, 'item')}</p>

	{#if archived.length}
		<!-- No bound `open`: hydrating would close it if someone opened it before the app started. -->
		<details class="archived">
			<summary class="section-title">Archived ({archived.length})</summary>
			<p class="sub">Hidden from your lists and from everyone else. Restore one to put it back on the lists it was on.</p>
			<div class="archived-list">
				{#each archived as it (it.id)}
					<div class="row archived-row" in:slide>
						{#if it.cover}<img src={it.cover} alt="" class="thumb" loading="lazy" />{:else}<span class="thumb empty"></span>{/if}
						<a href="/items/{it.id}" class="body">
							<span class="write name">{it.title}</span>
							<span class="meta">{it.lists.length ? `Was on ${it.lists.map((l) => l.title).join(', ')}` : 'Not on a list'}</span>
						</a>
						<form method="POST" action="?/restore" use:enhance>
							<input type="hidden" name="itemId" value={it.id} />
							<button class="btn btn-outline btn-md" aria-label="Restore {it.title}">Restore</button>
						</form>
					</div>
				{/each}
			</div>
		</details>
	{/if}
</main>

<style>
	.note {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		padding: 14px 18px;
		background: var(--gold-soft);
		border-radius: 6px;
		font-size: 15px;
	}
	.note p {
		margin: 0;
		flex: 1 1 240px;
	}
	.archived summary {
		cursor: pointer;
		min-height: 44px;
		display: flex;
		align-items: center;
	}
	.archived-list {
		margin-top: 8px;
	}
	.archived-row .body {
		text-decoration: none;
		color: inherit;
		display: flex;
		flex-direction: column;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 4px 16px;
	}
	.tools :global(details[open]) {
		flex-basis: 100%;
	}
	.add-anywhere {
		gap: 6px;
		padding-left: 0;
	}
	.page {
		padding-top: 40px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.title-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.sub {
		margin: 8px 0 0;
		font-size: 15px;
		color: var(--ink2);
	}
	.search {
		padding: 8px 0 10px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
		text-decoration: none;
		color: var(--ink2);
	}
	.thumb {
		width: 48px;
		height: 48px;
		border-radius: 4px;
		object-fit: cover;
		background: var(--desk);
		flex: none;
	}
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.name {
		font-size: 22px;
		color: var(--ink);
		display: inline-flex;
		align-items: center;
	}
	.empty-copy {
		margin: 0;
		padding: 20px 0;
		font-size: 15px;
		color: var(--ink2);
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 10px 16px 16px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
