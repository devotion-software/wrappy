<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SantaFields from '#lib/components/SantaFields.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Organise a Secret Santa — Wrappy</title></svelte:head>

<main class="container page">
	<a href="/santa" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />Secret Santa</a>
	<Sheet tape margin={50} padding="44px 40px 36px 72px" class="sheet">
		<h1 class="hand">Organise a Secret Santa</h1>
		<p class="sub">You'll get a link to share. When everyone's in, draw names and we'll email each person who they're buying for.</p>
		<form method="POST" class="stack">
			<SantaFields />
			<label class="check">
				<input type="checkbox" name="playing" checked />
				<span>I'm taking part too</span>
			</label>
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			<button class="btn btn-primary btn-lg">Create Secret Santa</button>
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
		margin: 0;
		font-size: 52px;
	}
	.sub {
		margin: 8px 0 26px;
		font-size: 15px;
		line-height: 1.5;
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
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 15px;
		cursor: pointer;
	}
	.check input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--gold);
	}
	@media (max-width: 520px) {
		.page :global(.sheet) {
			padding: 40px 18px 28px 46px !important;
		}
		.page :global(.sheet > .margin) {
			left: 28px !important;
		}
	}
</style>
