<script lang="ts">
	import { page } from '$app/state';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	let { data, form } = $props();
	let busy = $state(false);

	const host = $derived.by(() => {
		try {
			return data.shared?.url ? new URL(data.shared.url).hostname.replace(/^www\./, '') : null;
		} catch {
			return null;
		}
	});

	// Opens /add in a small window with the current page's address and title.
	const bookmarklet = $derived(
		`javascript:(()=>{window.open('${page.url.origin}/add?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'wrappy','width=520,height=720')})()`
	);
</script>

<svelte:head><title>Add to Wrappy</title></svelte:head>

<main class="container page">
	<Sheet tape margin={50} padding="40px 36px 32px 72px" class="sheet">
		{#if data.shared}
			<h1 class="hand">Add to Wrappy</h1>
			<div class="shared">
				<p class="write title">{data.shared.title ?? host}</p>
				{#if host}<p class="meta"><Icon name="link" size={14} />{host}</p>{/if}
			</div>
			<form method="POST" class="stack" onsubmit={() => (busy = true)}>
				<input type="hidden" name="url" value={data.shared.url ?? ''} />
				<input type="hidden" name="title" value={data.shared.title ?? ''} />
				<div class="field">
					<label for="listId">Add it to</label>
					<select id="listId" name="listId" class="line-input select">
						<option value="">Just my items</option>
						{#each data.lists as l (l.id)}<option value={l.id}>{l.title}</option>{/each}
					</select>
				</div>
				{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
				<button class="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Adding…' : 'Add it'}</button>
				{#if data.shared.url}<p class="meta">We'll pick up the name, price and picture from the shop.</p>{/if}
			</form>
		{:else}
			<h1 class="hand">Add from anywhere</h1>
			<p class="copy">Save things to Wrappy straight from the shop, without copying links.</p>

			<h2 class="label">On a computer</h2>
			<p class="copy">Drag this button to your bookmarks bar. On a product page, click it to add that page to Wrappy.</p>
			<!-- svelte-ignore a11y_invalid_attribute -->
			<a
				class="btn btn-outline bookmarklet"
				href={bookmarklet}
				onclick={(e) => {
					e.preventDefault();
					alert('Drag this button to your bookmarks bar, then click it on any shop page.');
				}}><Icon name="plus" />Add to Wrappy</a
			>

			<h2 class="label">On a phone</h2>
			<p class="copy">
				Add Wrappy to your home screen (Share, then Add to Home Screen, or Install app). Then on Android, share a product
				page and pick Wrappy. On an iPhone, copy the link and paste it into any list.
			</p>
		{/if}
	</Sheet>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		max-width: 640px;
	}
	h1 {
		margin: 0 0 16px;
		font-size: 52px;
	}
	.shared {
		margin-bottom: 24px;
	}
	.shared .title {
		margin: 0;
		font-size: 24px;
		overflow-wrap: anywhere;
	}
	.shared .meta {
		margin: 4px 0 0;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.stack .btn {
		align-self: flex-start;
	}
	.copy {
		margin: 0 0 16px;
		font-size: 15px;
		line-height: 1.55;
		color: var(--ink2);
	}
	h2.label {
		margin: 24px 0 6px;
	}
	.bookmarklet {
		cursor: grab;
	}
	@media (max-width: 520px) {
		.page :global(.sheet) {
			padding: 36px 18px 26px 46px !important;
		}
		.page :global(.sheet > .margin) {
			left: 28px !important;
		}
	}
</style>
