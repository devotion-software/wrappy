<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';

	let { data, form } = $props();
	const off = $derived(form?.done || !data.on);
</script>

<svelte:head><title>Email reminders — Wrappy</title></svelte:head>

<main class="container page">
	<h1 class="hand">Email reminders</h1>
	<Sheet tape margin={50} padding="28px 32px 28px 72px" class="sheet">
		{#if off}
			<p class="write big" role="status">Done. You won't get these any more:</p>
			<p class="copy">{data.label}.</p>
			<p class="copy">Changed your mind? Turn them back on from your <a href="/account#emails">account page</a>.</p>
		{:else}
			<p class="write big">Stop these emails?</p>
			<p class="copy">{data.label}.</p>
			<form method="POST" use:enhance>
				<button class="btn btn-dark btn-md">Stop these reminders</button>
			</form>
		{/if}
	</Sheet>
</main>

<style>
	.page {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 640px;
	}
	h1 {
		margin: 0;
		font-size: 56px;
	}
	.big {
		margin: 0 0 6px;
		font-size: 24px;
	}
	.copy {
		margin: 0 0 14px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	@media (max-width: 520px) {
		.page :global(.sheet) {
			padding: 24px 18px 24px 46px !important;
		}
		.page :global(.sheet > .margin) {
			left: 28px !important;
		}
	}
</style>
