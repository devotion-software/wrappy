<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AddGiftForm from '#lib/components/AddGiftForm.svelte';
	import { formatPrice, plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
	const first = $derived(data.person.name.split(' ')[0]);
	const total = $derived(data.fromLists.length + data.noted.length);
	let editing = $state(false);
</script>

<svelte:head><title>From {data.person.name} — Wishlist</title></svelte:head>

<main class="container page">
	<a href="/gifts" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />Presents received</a>

	<div class="who">
		<Avatar name={data.person.name} size={64} onDesk />
		<div>
			<h1 class="hand">From {data.person.name}</h1>
			<p class="meta">{plural(total, 'present')}{data.person.isContact ? ' · not on Wishlist' : ''}</p>
		</div>
	</div>

	<Sheet tape margin={50} padding="18px 28px 22px 72px" class="sheet">
		{#if !data.received}
			<p class="copy">
				You haven't ticked {first} off as someone you've received presents from, so anything they bought from your lists
				stays hidden. Adding a present below ticks them off.
			</p>
		{/if}

		{#if data.fromLists.length}
			<h2 class="label">From your lists</h2>
			{#each data.fromLists as g (g.itemId)}
				<a href="/items/{g.itemId}" class="row">
					<Checkbox checked tilt={tiltFor(g.itemId)} />
					{#if g.cover}<img src={g.cover} alt="" class="thumb" loading="lazy" />{/if}
					<span class="write title">{g.title}</span>
					<span class="meta">{formatPrice(g.price, g.currency) ?? ''}</span>
				</a>
			{/each}
		{/if}

		{#if data.noted.length}
			{#if data.fromLists.length}<h2 class="label">Other presents</h2>{/if}
			{#each data.noted as g (g.id)}
				<div class="row">
					<Checkbox checked tilt={tiltFor(g.id)} />
					<span class="write title">{g.title}</span>
					<form method="POST" action="?/removeGift" use:enhance>
						<input type="hidden" name="giftId" value={g.id} />
						<button class="btn btn-icon" aria-label="Remove {g.title}"><Icon name="trash" size={16} /></button>
					</form>
				</div>
			{/each}
		{/if}

		{#if !total}
			<p class="copy">Nothing yet. Add anything {first} gave you below.</p>
		{/if}

		<div class="add">
			<AddGiftForm
				giverId={data.person.id}
				isContact={data.person.isContact}
				giverFirstName={first}
				error={form?.giftError?.message ?? null}
			/>
		</div>
	</Sheet>

	{#if data.person.isContact}
		<div class="manage">
			{#if editing}
				<form method="POST" action="?/renameContact" class="rename" use:enhance={() => async ({ update, result }) => {
					await update();
					if (result.type === 'success') editing = false;
				}}>
					<input type="hidden" name="contactId" value={data.person.id} />
					<label for="rename" class="sr-only">Name</label>
					<input id="rename" name="name" class="line-input" maxlength="80" value={data.person.name} required />
					<button class="btn btn-dark">Save</button>
					<button type="button" class="btn btn-text" onclick={() => (editing = false)}>Cancel</button>
				</form>
				{#if form?.renameError}<p class="field-error" role="alert">{form.renameError}</p>{/if}
			{:else}
				<button class="btn btn-text" onclick={() => (editing = true)}><Icon name="edit" size={16} />Rename</button>
			{/if}
			<form
				method="POST"
				action="?/deleteContact"
				onsubmit={(e) => {
					if (!confirm(`Remove ${data.person.name} and ${plural(total, 'present')} you noted from them?`)) e.preventDefault();
				}}
			>
				<button class="btn btn-text"><Icon name="trash" size={16} />Remove {first}</button>
			</form>
		</div>
	{/if}
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 820px;
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
	.who {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	h1 {
		margin: 0;
		font-size: 56px;
		overflow-wrap: anywhere;
	}
	.who .meta {
		margin: 4px 0 0;
		font-size: 15px;
	}
	.copy {
		margin: 8px 0 12px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.label {
		display: block;
		margin: 14px 0 2px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 56px;
		border-bottom: 1px solid var(--rule);
		text-decoration: none;
		color: var(--ink);
	}
	.thumb {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		object-fit: cover;
		background: var(--desk);
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: 22px;
		overflow-wrap: anywhere;
	}
	.row form {
		margin: 0;
	}
	.add {
		padding-top: 14px;
	}
	.manage {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
		margin-left: -8px;
	}
	.manage .btn-text {
		gap: 6px;
	}
	.rename {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		flex: 1 1 320px;
		padding-left: 8px;
	}
	.rename input {
		flex: 1;
		min-width: 0;
	}
	@media (max-width: 600px) {
		h1 {
			font-size: 44px;
		}
		.page :global(.sheet) {
			padding: 14px 16px 18px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
