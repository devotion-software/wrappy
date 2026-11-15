<script lang="ts">
	import { page } from '$app/state';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';

	interface Props {
		user: { name: string; email: string; theme: string; username?: string | null } | null;
	}
	let { user }: Props = $props();

	const nav = [
		{ href: '/lists', label: 'My lists', match: ['/lists', '/items'] },
		{ href: '/santa', label: 'Secret Santa', match: ['/santa'] },
		{ href: '/friends', label: 'Friends', match: ['/friends', '/u/'] }
	];
	const current = (match: string[]) => match.some((m) => page.url.pathname.startsWith(m));
</script>

<header>
	<div class="container bar">
		{#if user}
			<div class="left">
				<Logo href="/lists" size="sm" />
				<nav aria-label="Main">
					{#each nav as n (n.href)}
						<a href={n.href} aria-current={current(n.match) ? 'page' : undefined}>{n.label}</a>
					{/each}
				</nav>
			</div>
			<div class="right">
				<a href="/lists/new" class="btn btn-primary btn-md new"><Icon name="plus" strokeWidth={2.2} />New list</a>
				<AccountMenu {user} />
			</div>
		{:else}
			<Logo href="/" size="sm" />
			<div class="right">
				<a href="/signin?next={encodeURIComponent(page.url.pathname)}" class="btn btn-dark btn-md">Log in</a>
			</div>
		{/if}
	</div>
</header>

<style>
	header {
		background: var(--paper);
		border-bottom: 1px solid var(--line);
		/* Own view-transition layer, so it stays still while the page below cross-fades. */
		view-transition-name: site-header;
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
		transition:
			background-color 0.2s,
			color 0.2s;
	}
	nav a:hover {
		color: var(--ink);
		background: color-mix(in srgb, var(--desk) 60%, transparent);
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
