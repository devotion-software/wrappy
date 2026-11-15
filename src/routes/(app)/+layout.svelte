<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';

	let { data, children } = $props();

	const nav = [
		{ href: '/lists', label: 'My lists' },
		{ href: '/santa', label: 'Secret Santa' },
		{ href: '/friends', label: 'Friends' }
	];
	const current = (href: string) => page.url.pathname.startsWith(href);
</script>

<div class="app">
	<header>
		<div class="container bar">
			<div class="left">
				<Logo href="/lists" size="sm" />
				<nav aria-label="Main">
					{#each nav as n (n.href)}
						<a href={n.href} aria-current={current(n.href) ? 'page' : undefined}>{n.label}</a>
					{/each}
				</nav>
			</div>
			<div class="right">
				<a href="/lists/new" class="btn btn-primary btn-md new"
					><Icon name="plus" strokeWidth={2.2} />New list</a
				>
				{#if data.user}<AccountMenu user={data.user} />{/if}
			</div>
		</div>
	</header>

	{@render children()}
</div>

<style>
	.app {
		min-height: 100vh;
	}
	header {
		background: var(--paper);
		border-bottom: 1px solid var(--line);
	}
	.bar {
		padding-top: 14px;
		padding-bottom: 14px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 12px 24px;
	}
	.left {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 36px;
	}
	nav {
		display: flex;
		gap: 4px;
		font-size: 15px;
	}
	nav a {
		padding: 10px 14px;
		border-radius: 999px;
		text-decoration: none;
		color: var(--ink2);
	}
	nav a[aria-current='page'] {
		background: var(--desk);
		font-weight: 600;
		color: var(--ink);
	}
	.right {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.new {
		padding: 0 18px;
		gap: 6px;
	}
	/* Phones: logo + actions on the first row, nav on its own row below. */
	@media (max-width: 640px) {
		.left {
			display: contents;
		}
		nav {
			order: 3;
			width: 100%;
		}
		nav a {
			padding: 10px 12px;
		}
		.new {
			padding: 0 14px;
		}
	}
</style>
