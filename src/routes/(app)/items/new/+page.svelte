<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import ItemFields from '#lib/components/ItemFields.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>New wish — Wishlist</title></svelte:head>

<main class="container page">
	<a href={data.target ? `/lists/${data.target.id}` : '/items'} class="back"
		><Icon name="arrow-left" size={16} strokeWidth={2} />{data.target?.title ?? 'All my wishes'}</a
	>
	<Sheet tape margin={50} padding="40px 36px 32px 72px" class="sheet">
		<h1 class="hand">New wish</h1>
		{#if data.target?.santaLimit}
			<p class="sub">For your Secret Santa list. If you add a price, keep it to {data.target.santaLimit} or less.</p>
		{:else if data.target}
			<p class="sub">It'll be added to {data.target.title}. You can add pictures and links next.</p>
		{:else}
			<p class="sub">You can add pictures, links and lists next.</p>
		{/if}
		<form method="POST" class="stack">
			<ItemFields values={{ currency: data.target?.currency ?? 'GBP' }} />
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary btn-lg">Save wish</button>
		</form>
	</Sheet>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 720px;
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
		margin: 0;
		font-size: 56px;
	}
	.sub {
		margin: 8px 0 24px;
		font-size: 15px;
		color: var(--ink2);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.stack .btn {
		align-self: flex-start;
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
