<script lang="ts">
	import '#lib/styles/app.css';
	let { children } = $props();
</script>

<svelte:head><title>Wishlist</title></svelte:head>

{@render children()}
