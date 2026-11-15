<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import SantaNote from '#lib/components/SantaNote.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Secret Santa — Wishlist</title></svelte:head>

<main class="container page">
	<div class="title-row">
		<div>
			<h1 class="hand">Secret Santa</h1>
			<p class="sub">Share a join link, set a budget, and we'll draw names for you.</p>
		</div>
		<a href="/santa/new" class="btn btn-primary btn-md"><Icon name="plus" strokeWidth={2.2} />Organise a Secret Santa</a>
	</div>

	{#if data.santas.length}
		<div class="grid">
			{#each data.santas as s (s.id)}
				<SantaNote {s} />
			{/each}
		</div>
	{:else}
		<Sheet margin={false} padding="24px">
			<p class="empty">
				You're not in any Secret Santas yet. Organise one, or open a join link someone sent you.
			</p>
		</Sheet>
	{/if}
</main>

<style>
	.page {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 32px;
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
		font-size: 16px;
		color: var(--ink2);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 28px;
		align-items: start;
	}
	.empty {
		margin: 0;
		font-size: 15px;
		color: var(--ink2);
	}
</style>
