<script lang="ts">
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import ListCard from '#lib/components/ListCard.svelte';

	let { data } = $props();
	const isMe = $derived(data.user?.id === data.profileUserId);
</script>

<svelte:head><title>{data.profile.name}'s wish lists — Wrappy</title></svelte:head>

<main class="container page">
	<div class="who">
		<Avatar name={data.profile.name} size={64} onDesk />
		<div>
			<h1 class="hand">{data.profile.name}</h1>
			<p class="meta">@{data.profile.username}</p>
		</div>
	</div>

	<section class="block">
		<h2 class="section-title">Public lists</h2>
		<div class="grid">
			{#each data.lists as card, i (card.id)}
				<ListCard {card} index={i} />
			{:else}
				<p class="empty">
					{#if isMe}
						None of your lists are public yet. Open a list, choose <strong>Edit list</strong>, and set it to public.
					{:else}
						{data.profile.name} hasn't made any lists public yet.
					{/if}
				</p>
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
		gap: 40px;
	}
	.who {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.who .meta {
		margin: 4px 0 0;
		font-size: 15px;
	}
	.block {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 24px;
	}
	.empty {
		margin: 0;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
		grid-column: 1 / -1;
	}
</style>
