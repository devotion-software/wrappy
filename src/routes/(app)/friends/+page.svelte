<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ListCard from '#lib/components/ListCard.svelte';
	import { plural } from '#lib/format';

	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head><title>Friends — Wrappy</title></svelte:head>

<main class="container page">
	<h1 class="hand">Friends</h1>

	<Sheet margin={50} padding="24px 28px 20px 72px" class="sheet">
		<form method="GET" class="search">
			<label for="q" class="label">Find a friend</label>
			<div class="search-row">
				<input id="q" name="q" class="line-input" placeholder="Name or @username" value={data.q} minlength="2" />
				<button class="btn btn-dark btn-md">Search</button>
			</div>
		</form>
		{#if data.q}
			<div class="results">
				{#each data.results as r (r.username)}
					<a href="/u/{r.username}" class="person">
						<Avatar name={r.name} />
						<span class="who"><span class="write">{r.name}</span><span class="meta">@{r.username} · {r.lists ? plural(r.lists, 'public list') : 'no public lists yet'}</span></span>
						<span class="btn btn-outline">View</span>
					</a>
				{:else}
					<p class="empty">No one matches "{data.q}". To find someone without public lists, search for their exact @username.</p>
				{/each}
			</div>
		{/if}
	</Sheet>

	<section class="block" id="groups">
		<div>
			<h2 class="section-title">Groups</h2>
			<p class="meta intro">Share a list with everyone in a group in one go. Anyone in a group can invite people to it.</p>
		</div>
		{#if data.groups.length}
			<ul class="groups">
				{#each data.groups as g (g.id)}
					<li>
						<a href="/groups/{g.id}" class="person">
							<span class="who"><span class="write">{g.name}</span><span class="meta">{plural(g.members, 'person', 'people')}{g.isOwner ? ' · you made it' : ''}</span></span>
							<span class="btn btn-outline">Open</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
		<form method="POST" action="?/createGroup" class="new-group" use:enhance>
			<div class="grow">
				<label for="group-name" class="label">New group</label>
				<input id="group-name" name="name" class="line-input" maxlength="80" placeholder="Family" required autocomplete="off" />
			</div>
			<button class="btn btn-dark btn-md">Create group</button>
		</form>
		{#if form?.groupError}<p class="field-error" role="alert">{form.groupError}</p>{/if}
	</section>

	<section class="block">
		<h2 class="section-title">Shared with you</h2>
		<div class="grid">
			{#each data.shared as card, i (card.id)}
				<ListCard {card} index={i} />
			{:else}
				<p class="empty">When someone shares a list with you, or you open one, it shows up here.</p>
			{/each}
		</div>
	</section>
</main>

<style>
	.page {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 32px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.search {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.search-row {
		display: flex;
		gap: 12px;
		align-items: flex-end;
	}
	.search-row input {
		flex: 1;
		min-width: 0;
	}
	.results {
		margin-top: 12px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
		text-decoration: none;
		color: var(--ink);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.who .write {
		font-size: 21px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.intro {
		margin: 6px 0 0;
		font-size: 15px;
	}
	.groups {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.new-group {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		max-width: 520px;
	}
	.new-group .grow {
		flex: 1;
		min-width: 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 24px;
	}
	.empty {
		margin: 0;
		padding: 12px 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
		grid-column: 1 / -1;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 20px 16px 16px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
