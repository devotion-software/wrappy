<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';

	let { data } = $props();
	const firstName = $derived(data.user?.name.split(' ')[0] ?? '');
</script>

<svelte:head><title>My lists — Wishlist</title></svelte:head>

<main class="container home">
	<div class="main-col">
		<div>
			<h1 class="hand">Hi {firstName}</h1>
			<p class="greeting">Start a list, then share it with the people who buy you presents.</p>
		</div>

		<section class="block">
			<div class="head">
				<h2 class="section-title">Your lists</h2>
				<span class="meta">0 lists</span>
			</div>
			<div class="grid">
				<a href="/lists/new" class="new-tile">
					<Icon name="plus" size={28} />
					<span class="write">Start a new list</span>
				</a>
			</div>
		</section>

		<section class="block" id="friends">
			<h2 class="section-title">Friends' lists</h2>
			<Sheet margin={false} padding="20px 24px">
				<p class="empty">Lists friends share with you will show up here.</p>
			</Sheet>
		</section>
	</div>

	<aside>
		<h2 class="section-title">Secret Santa</h2>
		<a href="/santa" class="organise write"><Icon name="plus" size={22} />Organise a Secret Santa</a>
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
	}
	.new-tile span {
		font-size: 22px;
	}
	.empty {
		margin: 0;
		font-size: 15px;
		color: var(--ink2);
	}
	aside {
		flex: 1 1 300px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}
	.organise {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 16px 4px;
		color: var(--ink2);
		text-decoration: none;
		font-size: 21px;
	}
</style>
