<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import ListSettingsFields from '#lib/components/ListSettingsFields.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	let { form } = $props();
</script>

<svelte:head><title>New list — Wishlist</title></svelte:head>

<main class="container page">
	<a href="/lists" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />All lists</a>
	<Sheet tape margin={50} padding="44px 40px 36px 72px" class="sheet">
		<h1 class="hand">Start a new list</h1>
		<form method="POST" class="stack">
			<ListSettingsFields values={form?.values} />
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary btn-lg">Create list</button>
		</form>
	</Sheet>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 28px;
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
		margin: 0 0 28px;
		font-size: 56px;
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
			padding: 40px 20px 28px 48px !important;
		}
		.page :global(.sheet .margin) {
			left: 28px !important;
		}
	}
</style>
