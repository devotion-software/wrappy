<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import { tiltFor } from '#lib/format';

	let { data } = $props();
	const isRevealed = (id: string) => data.revealed.includes(id);
	const giftsFrom = (id: string) => data.gifts.filter((g) => g.giverId === id);
	const anyLeft = $derived(data.people.some((p) => !isRevealed(p.id)));
</script>

<svelte:head><title>Presents received — Wishlist</title></svelte:head>

<main class="container page">
	<div>
		<h1 class="hand">Presents received</h1>
		<p class="sub">
			Tick off who you've opened presents from. You'll then see what they marked as bought from your lists — nothing else is
			revealed.
		</p>
	</div>

	<Sheet tape margin={50} padding="22px 28px 22px 72px" class="sheet">
		{#each data.people as p (p.id)}
			<div class="person">
				<form method="POST" action={isRevealed(p.id) ? '?/undo' : '?/received'} use:enhance>
					<input type="hidden" name="giverId" value={p.id} />
					<button class="tick-btn" aria-pressed={isRevealed(p.id)} aria-label="{isRevealed(p.id) ? 'Unmark' : 'Mark'} received from {p.name}">
						<Checkbox checked={isRevealed(p.id)} tilt={tiltFor(p.id)} />
					</button>
				</form>
				<Avatar name={p.name} size={36} />
				<div class="who">
					<p class="write name">{p.name}</p>
					{#if isRevealed(p.id)}
						{#if giftsFrom(p.id).length}
							<p class="note">got you {giftsFrom(p.id).map((g) => g.title).join(', ')}</p>
						{:else}
							<p class="meta">Nothing from your lists was marked as bought by {p.name.split(' ')[0]}.</p>
						{/if}
					{/if}
				</div>
			</div>
		{:else}
			<p class="empty">Once people open your lists, they'll appear here.</p>
		{/each}

		{#if anyLeft}
			<form method="POST" action="?/receivedAll" use:enhance class="all">
				<button class="btn btn-primary btn-md">Received from everyone</button>
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
		gap: 28px;
		max-width: 820px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.sub {
		margin: 8px 0 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--ink2);
		max-width: 620px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
	}
	.tick-btn {
		width: 44px;
		height: 44px;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.who p {
		margin: 0;
	}
	.name {
		font-size: 22px;
	}
	.note {
		font-size: 20px;
	}
	.empty {
		margin: 0;
		padding: 16px 0;
		font-size: 15px;
		color: var(--ink2);
	}
	.all {
		padding-top: 18px;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 18px 16px 18px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
