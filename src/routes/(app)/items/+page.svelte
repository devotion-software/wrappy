<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import PasteList from '#lib/components/PasteList.svelte';
	import { formatPrice, plural } from '#lib/format';

	let { data } = $props();
	let q = $state('');
	const shown = $derived(
		q.trim() ? data.items.filter((i) => i.title.toLowerCase().includes(q.trim().toLowerCase())) : data.items
	);
</script>

<svelte:head><title>All my wishes — Wishlist</title></svelte:head>

<main class="container page">
	<div class="title-row">
		<div>
			<h1 class="hand">All my wishes</h1>
			<p class="sub">Every wish you've written, and the lists it's on. Edit it once and it changes everywhere.</p>
		</div>
		<a href="/items/new" class="btn btn-primary btn-md"><Icon name="plus" strokeWidth={2.2} />New wish</a>
	</div>

	<PasteList />

	<Sheet margin={50} padding="14px 28px 20px 72px" class="sheet">
		{#if data.items.length > 6}
			<div class="search">
				<label for="q" class="sr-only">Search your wishes</label>
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
				{data.items.length ? 'Nothing matches that search.' : 'No wishes yet. Add one here, paste a list, or add them from any of your lists.'}
			</p>
		{/each}
	</Sheet>
	<p class="meta">{plural(data.items.length, 'wish', 'wishes')}</p>
</main>

<style>
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
