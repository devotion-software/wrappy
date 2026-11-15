<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import AddGiftForm from '#lib/components/AddGiftForm.svelte';
	import { plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
	const isRevealed = (id: string) => data.revealed.includes(id);
	const giftsFrom = (id: string) => [
		...data.fromLists.filter((g) => g.giverId === id).map((g) => g.title),
		...data.noted.filter((g) => g.giverId === id).map((g) => g.title)
	];
	const anyLeft = $derived(data.people.some((p) => !isRevealed(p.id)));
</script>

<svelte:head><title>Presents received — Wishlist</title></svelte:head>

<main class="container page">
	<div>
		<h1 class="hand">Presents received</h1>
		<p class="sub">
			Tick off who you've opened presents from. You'll then see what they marked as bought from your lists, and you
			can note anything else they gave you.
		</p>
	</div>

	<Sheet tape margin={50} padding="22px 28px 22px 72px" class="sheet">
		{#each data.people as p (p.id)}
			{@const gifts = giftsFrom(p.id)}
			{@const first = p.name.split(' ')[0]}
			<div class="person">
				<div class="person-head">
					<form method="POST" action={isRevealed(p.id) ? '?/undo' : '?/received'} use:enhance>
						<input type="hidden" name="giverId" value={p.id} />
						<button
							class="tick-btn"
							aria-pressed={isRevealed(p.id)}
							aria-label="{isRevealed(p.id) ? 'Unmark' : 'Mark'} received from {p.name}"
						>
							<Checkbox checked={isRevealed(p.id)} tilt={tiltFor(p.id)} />
						</button>
					</form>
					<Avatar name={p.name} size={36} />
					<div class="who">
						<p class="write name">{p.name}</p>
						{#if isRevealed(p.id)}
							{#if gifts.length}
								<p class="note">got you {gifts.join(', ')}</p>
							{:else}
								<p class="meta">Nothing noted from {first} yet.</p>
							{/if}
						{/if}
					</div>
					{#if isRevealed(p.id)}
						<a href="/gifts/{p.id}" class="btn btn-outline see-all"
							>{gifts.length ? `See all ${gifts.length}` : 'Open'}</a
						>
					{/if}
				</div>
				{#if isRevealed(p.id)}
					<div class="add">
						<AddGiftForm
							giverId={p.id}
							giverFirstName={first}
							error={form?.giftError?.giverId === p.id ? form.giftError.message : null}
						/>
					</div>
				{/if}
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
	{#if data.revealed.length}
		<p class="meta">{plural(data.revealed.length, 'person', 'people')} ticked off.</p>
	{/if}
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
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
	}
	.person-head {
		display: flex;
		align-items: center;
		gap: 14px;
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
	.see-all {
		flex: none;
	}
	.add {
		padding: 4px 0 2px 58px;
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
		.add {
			padding-left: 0;
		}
		.person-head {
			flex-wrap: wrap;
		}
	}
</style>
