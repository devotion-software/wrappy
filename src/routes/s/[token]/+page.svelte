<script lang="ts">
	// Only link-preview fetchers see this page; people are redirected straight to the list.
	let { data } = $props();
</script>

<svelte:head><title>{data.title} — Wrappy</title></svelte:head>

<main class="container">
	<h1 class="hand">{data.title}</h1>
	<p>{data.meta.description}</p>
</main>
