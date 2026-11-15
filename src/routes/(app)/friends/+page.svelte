<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
</script>

<svelte:head><title>Friends — Wishlist</title></svelte:head>

<main class="container page">
	<h1 class="hand">Friends</h1>
	<Sheet margin={false} padding="20px 24px">
		<p class="empty">People who share lists with you will show up here.</p>
	</Sheet>
</main>

<style>
	.page { padding-top: 48px; padding-bottom: 80px; display: flex; flex-direction: column; gap: 28px; }
	h1 { margin: 0; font-size: 60px; }
	.empty { margin: 0; font-size: 15px; color: var(--ink2); }
</style>
