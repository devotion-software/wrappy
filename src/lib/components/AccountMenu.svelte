<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import Segmented from '#lib/components/ui/Segmented.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { fly } from '#lib/motion';

	type Theme = 'system' | 'light' | 'dark';
	interface Props {
		user: { name: string; email: string; theme: string };
	}
	let { user }: Props = $props();

	let open = $state(false);
	let theme = $state<Theme>((['system', 'light', 'dark'] as const).find((t) => t === user.theme) ?? 'system');
	let note = $state('');
	let root: HTMLDivElement;

	// Apply + persist the theme when it's changed from the toggle.
	function setTheme(t: Theme) {
		if (t === theme) return;
		theme = t;
		const el = document.documentElement;
		if (t === 'system') el.removeAttribute('data-theme');
		else el.setAttribute('data-theme', t);
		try {
			if (t === 'system') localStorage.removeItem('wishlist-theme');
			else localStorage.setItem('wishlist-theme', t);
		} catch {}
		authClient.updateUser({ theme: t });
	}

	async function addPasskey() {
		note = '';
		const res = await authClient.passkey.addPasskey();
		note = res?.error ? "The passkey wasn't saved. Try again." : 'Passkey added.';
	}

	async function signOut() {
		await authClient.signOut();
		await invalidateAll();
		await goto('/');
	}

	function onWindowClick(e: MouseEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="wrap" bind:this={root}>
	<button
		class="avatar-btn"
		aria-label="Account menu"
		aria-expanded={open}
		aria-haspopup="true"
		onclick={() => (open = !open)}>{(user.name[0] ?? '?').toUpperCase()}</button
	>
	{#if open}
		<div class="menu" role="menu" transition:fly>
			<div class="who">
				<p class="write name">{user.name}</p>
				<p class="meta">{user.email}</p>
			</div>
			<div class="row">
				<span class="label">Theme</span>
				<Segmented
					label="Theme"
					bind:value={() => theme, setTheme}
					options={[
						{ value: 'system', label: 'Auto' },
						{ value: 'light', label: 'Light' },
						{ value: 'dark', label: 'Dark' }
					]}
				/>
			</div>
			<a class="item" role="menuitem" href="/account" onclick={() => (open = false)}>Account settings</a>
			<a class="item" role="menuitem" href="/gifts" onclick={() => (open = false)}>Presents received</a>
			<button class="item" role="menuitem" onclick={addPasskey}><Icon name="key" />Add a passkey</button>
			{#if note}<p class="meta note-line" role="status">{note}</p>{/if}
			<button class="item" role="menuitem" onclick={signOut}>Log out</button>
			<p class="meta version">Version {__APP_VERSION__}</p>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}
	.avatar-btn {
		width: 44px;
		height: 44px;
		border-radius: 999px;
		border: 1.5px solid var(--ink);
		background: transparent;
		color: var(--ink);
		font: 600 14px var(--font-ui);
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s,
			transform 0.15s;
	}
	.avatar-btn:hover,
	.avatar-btn[aria-expanded='true'] {
		background: var(--ink);
		color: var(--paper);
	}
	.avatar-btn:active {
		transform: scale(0.94);
	}
	.menu {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		z-index: 20;
		width: min(300px, calc(100vw - 32px));
		background: var(--paper);
		border-radius: 4px;
		box-shadow: var(--shadow);
		border: 1px solid var(--line);
		padding: 8px 18px 12px;
	}
	.who {
		padding: 10px 0 12px;
		border-bottom: 1px solid var(--rule);
	}
	.who p {
		margin: 0;
	}
	.name {
		font-size: 22px;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 0;
		border-bottom: 1px solid var(--rule);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		min-height: 44px;
		border: 0;
		border-bottom: 1px solid var(--rule);
		background: transparent;
		color: var(--ink);
		font: 500 15px var(--font-ui);
		text-decoration: none;
		text-align: left;
		cursor: pointer;
		padding: 0;
		transition:
			padding-left 0.15s,
			color 0.15s;
	}
	.item:hover {
		padding-left: 6px;
		color: var(--gold-text);
	}
	.note-line {
		margin: 8px 0;
	}
	.version {
		margin: 12px 0 0;
		font-size: 12px;
	}
</style>
