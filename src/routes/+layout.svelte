<script lang="ts">
	import '#lib/styles/app.css';
	import { onNavigate } from '$app/navigation';
	import { reducedMotion } from '#lib/motion';
	let { children } = $props();

	// Cross-fade between pages with the View Transitions API, where supported.
	// Same-page navigations (e.g. form actions re-running load) don't animate.
	onNavigate((nav) => {
		if (!document.startViewTransition || reducedMotion()) return;
		if (nav.from?.url.pathname === nav.to?.url.pathname) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await nav.complete;
			});
		});
	});
</script>

<svelte:head><title>Wishlist</title></svelte:head>

{@render children()}
