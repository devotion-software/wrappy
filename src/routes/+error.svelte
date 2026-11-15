<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
</script>

<svelte:head><title>{page.status === 404 ? 'Not found' : 'Something went wrong'} — Wishlist</title></svelte:head>

<div class="page">
	<header class="container top"><Logo href={page.data.user ? '/lists' : '/'} /></header>
	<main>
		<Sheet tape margin={40} padding="44px 40px 36px 64px" class="card">
			<h1 class="hand">{page.status === 404 ? "Can't find that" : 'Something went wrong'}</h1>
			<p class="sub">{page.error?.message ?? 'Try again in a moment.'}</p>
			<a href={page.data.user ? '/lists' : '/'} class="btn btn-dark btn-md">{page.data.user ? 'Back to my lists' : 'Go home'}</a>
		</Sheet>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.top {
		width: 100%;
		max-width: 1200px;
		padding-top: 24px;
		padding-bottom: 24px;
	}
	main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 20px 80px;
	}
	main :global(.card) {
		width: 100%;
		max-width: 480px;
	}
	h1 {
		margin: 0;
		font-size: 48px;
	}
	.sub {
		margin: 10px 0 24px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
</style>
