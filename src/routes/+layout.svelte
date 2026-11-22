<script lang="ts">
	import '#lib/styles/app.css';
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { reducedMotion } from '#lib/motion';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import { SITE_META, type PageMeta } from '#lib/meta';
	let { children } = $props();

	// Link-preview card for whatever page this is (see #lib/meta). Pages opt in by returning `meta`.
	const meta = $derived((page.data.meta as PageMeta | undefined) ?? SITE_META);
	const image = $derived(`${page.url.origin}/og.png`);

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

<svelte:head>
	<title>Wrappy</title>
	<meta property="og:site_name" content="Wrappy" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={meta.title} />
	<meta property="og:description" content={meta.description} />
	<meta property="og:url" content={page.url.origin + page.url.pathname} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="A page of lined notebook paper reading: Wrappy. Write a wish list, share it, and keep the surprise." />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

{@render children()}
<ConfirmDialog />
