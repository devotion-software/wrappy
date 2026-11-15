<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
</script>

<svelte:head><title>Secret Santa — Wishlist</title></svelte:head>

<main class="container page">
	<h1 class="hand">Secret Santa</h1>
	<Sheet margin={false} padding="20px 24px">
		<p class="empty">Exchanges you organise or join will show up here.</p>
	</Sheet>
</main>

<style>
	.page { padding-top: 48px; padding-bottom: 80px; display: flex; flex-direction: column; gap: 28px; }
	h1 { margin: 0; font-size: 60px; }
	.empty { margin: 0; font-size: 15px; color: var(--ink2); }
</style>
