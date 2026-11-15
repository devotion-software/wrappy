<script lang="ts">
	import AppHeader from '#lib/components/AppHeader.svelte';
	let { data, children } = $props();
</script>

<div class="app">
	<AppHeader user={data.user} />
	{@render children()}
</div>

<style>
	.app {
		min-height: 100vh;
	}
</style>
