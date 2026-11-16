<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ListCard from '#lib/components/ListCard.svelte';
	import SantaNote from '#lib/components/SantaNote.svelte';
	import { formatDate, plural } from '#lib/format';

	let { data } = $props();
	const firstName = $derived(data.user?.name.split(' ')[0] ?? '');
	const totalItems = $derived(data.mine.reduce((n, l) => n + l.count, 0));
</script>

<svelte:head><title>My lists — Wrappy</title></svelte:head>

<main class="container home">
	<div class="main-col">
		<div>
			<h1 class="hand">Hi {firstName}</h1>
			<p class="greeting">
				{#if data.mine.length}
					You have {plural(totalItems, 'item')} across {plural(data.mine.length, 'list')}.
				{:else}
					Start a list, then share it with the people who buy you presents.
				{/if}
			</p>
		</div>

		<section class="block">
			<div class="head">
				<h2 class="section-title">Your lists</h2>
				<a href="/items" class="meta all-items">All my items</a>
			</div>
			<div class="grid">
				{#each data.mine as card, i (card.id)}
					<ListCard {card} showSharing index={i} />
				{/each}
				<a href="/lists/new" class="new-tile rise" style="--i: {data.mine.length}">
					<Icon name="plus" size={28} />
					<span class="write">Start a new list</span>
				</a>
			</div>
		</section>

		<section class="block" id="friends">
			<h2 class="section-title">Friends' lists</h2>
			<Sheet margin={false} padding="4px 24px">
				{#each data.friends as f (f.id)}
					<div class="friend">
						<Avatar name={f.ownerName ?? '?'} />
						<div class="who">
							<p class="write">{f.ownerName} · {f.title}</p>
							<p class="meta">
								{plural(f.count, 'item')}{f.eventDate ? ` · ${formatDate(f.eventDate)}` : ''}
							</p>
						</div>
						<a href="/lists/{f.id}" class="btn btn-outline">Open</a>
					</div>
				{:else}
					<p class="empty">
						Lists friends share with you will show up here. You can also <a href="/friends">find people</a> with
						public lists.
					</p>
				{/each}
			</Sheet>
		</section>
	</div>

	<aside>
		<h2 class="section-title">Secret Santa</h2>
		{#each data.santas as s (s.id)}
			<SantaNote {s} />
		{/each}
		<a href="/santa/new" class="organise write"><Icon name="plus" size={22} />Organise a Secret Santa</a>

		<h2 class="section-title">Opened your presents?</h2>
		<p class="aside-copy">
			Mark who you've received gifts from to see what they bought you. Until then, it stays a surprise.
		</p>
		<a href="/gifts" class="btn btn-outline self-start">Presents received</a>
	</aside>
</main>

<style>
	.home {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-wrap: wrap;
		gap: 40px;
	}
	.main-col {
		flex: 999 1 600px;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 48px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.greeting {
		margin: 8px 0 0;
		font-size: 16px;
		color: var(--ink2);
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.all-items {
		font-size: 14px;
		color: var(--ink2);
		text-underline-offset: 3px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 24px;
	}
	.new-tile {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 250px;
		border-radius: 4px;
		border: 2px dashed var(--line);
		text-decoration: none;
		color: var(--ink2);
		transition:
			border-color 0.2s,
			color 0.2s,
			background-color 0.2s;
	}
	.new-tile:hover {
		border-color: var(--gold);
		color: var(--gold-text);
		background: color-mix(in srgb, var(--gold-soft) 50%, transparent);
	}
	.new-tile :global(svg) {
		transition: transform 0.3s cubic-bezier(0.3, 0.7, 0.4, 1);
	}
	.new-tile:hover :global(svg) {
		transform: rotate(90deg) scale(1.1);
	}
	.new-tile span {
		font-size: 22px;
	}
	.friend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
		padding: 16px 0;
		border-bottom: 1px solid var(--rule);
	}
	.friend:last-child {
		border-bottom: 0;
	}
	.who {
		flex: 1 1 200px;
		min-width: 0;
	}
	.who p {
		margin: 0;
	}
	.who .write {
		font-size: 21px;
	}
	.who .meta {
		margin-top: 2px;
	}
	.empty {
		margin: 0;
		padding: 16px 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	aside {
		flex: 1 1 300px;
		display: flex;
		flex-direction: column;
		gap: 24px;
	}
	.organise {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 4px 4px 16px;
		color: var(--ink2);
		text-decoration: none;
		font-size: 21px;
		transition: color 0.2s;
	}
	.organise:hover {
		color: var(--gold-text);
	}
	.aside-copy {
		margin: -12px 0 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.self-start {
		align-self: flex-start;
	}
</style>
