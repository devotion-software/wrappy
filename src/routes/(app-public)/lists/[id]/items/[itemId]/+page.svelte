<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Gallery from '#lib/components/Gallery.svelte';
	import ItemRow from '#lib/components/ItemRow.svelte';
	import { formatPrice } from '#lib/format';

	let { data, form } = $props();
	const host = (u: string) => {
		try {
			return new URL(u).hostname.replace(/^www\./, '');
		} catch {
			return u;
		}
	};
	const firstName = $derived(data.ownerName.split(' ')[0]);
</script>

<svelte:head><title>{data.item.title} — Wishlist</title></svelte:head>

<main class="container page">
	<a href="/lists/{data.list.id}" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />{data.list.title}</a>

	<div class="layout">
		{#if data.images.length}
			<div class="pics"><Gallery images={data.images} title={data.item.title} /></div>
		{/if}
		<Sheet tape margin={40} padding="34px 28px 24px 62px" class="detail">
			<h1 class="write title">
				{data.item.title}
				{#if data.item.mostWanted}<Icon name="star" size={22} label="Most wanted" />{/if}
			</h1>
			{#if formatPrice(data.item.price, data.item.currency)}
				<p class="price">{formatPrice(data.item.price, data.item.currency)}</p>
			{/if}
			{#if data.item.notes}<p class="notes">{data.item.notes}</p>{/if}

			{#if data.links.length}
				<h2 class="label">Where to find it</h2>
				<ul class="links">
					{#each data.links as l (l.id)}
						<li>
							<a href={l.url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={16} />{l.label || host(l.url)}</a>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="claim">
				<ItemRow
					item={{ ...data.item, cover: null, notes: null, link: null, price: null }}
					listId={data.list.id}
					mode="guest"
					signedIn={!!data.user}
					ownerName={firstName}
					claimError={form?.claimError?.message ?? null}
				/>
			</div>
		</Sheet>
	</div>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
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
	.layout {
		display: flex;
		flex-wrap: wrap;
		gap: 32px;
		align-items: flex-start;
	}
	.pics {
		flex: 1 1 380px;
		min-width: 0;
	}
	.layout > :global(.detail) {
		flex: 1 1 420px;
		min-width: 0;
	}
	.title {
		margin: 0;
		font-size: 34px;
		font-weight: 400;
		line-height: 1.15;
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.price {
		margin: 6px 0 0;
		font-size: 18px;
		font-weight: 600;
	}
	.notes {
		margin: 14px 0 0;
		font-size: 16px;
		line-height: 1.6;
		color: var(--ink2);
		white-space: pre-line;
	}
	.label {
		display: block;
		margin: 22px 0 4px;
	}
	.links {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.links li {
		border-bottom: 1px solid var(--rule);
	}
	.links a {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 44px;
		font-size: 15px;
		color: var(--ink);
		text-underline-offset: 3px;
		overflow-wrap: anywhere;
	}
	.claim {
		margin-top: 18px;
	}
	.claim :global(.row) {
		border-bottom: 0;
		border-top: 1px solid var(--rule);
	}
	.claim :global(.thumb),
	.claim :global(.body) {
		display: none;
	}
</style>
