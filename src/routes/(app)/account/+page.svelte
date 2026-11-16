<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { authClient } from '#lib/auth-client';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { CURRENCIES } from '#lib/format';

	let { data, form } = $props();
	let passkeys = $state<{ id: string; name?: string | null; createdAt?: Date | string | null }[]>([]);
	let note = $state('');

	async function loadPasskeys() {
		const res = await authClient.passkey.listUserPasskeys();
		passkeys = (res.data ?? []) as typeof passkeys;
	}
	onMount(loadPasskeys);

	async function add() {
		note = '';
		const res = await authClient.passkey.addPasskey();
		note = res?.error ? "The passkey wasn't saved. Try again." : 'Passkey added.';
		await loadPasskeys();
	}
	async function remove(id: string) {
		if (!confirm('Remove this passkey? You can still log in with an email code.')) return;
		await authClient.passkey.deletePasskey({ id });
		await loadPasskeys();
	}
</script>

<svelte:head><title>Account — Wrappy</title></svelte:head>

<main class="container page">
	<h1 class="hand">Account</h1>
	<Sheet tape margin={50} padding="36px 32px 30px 72px" class="sheet">
		<form method="POST" action="?/profile" class="stack" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<div class="field">
				<label for="name">Your name</label>
				<input id="name" name="name" class="line-input" required maxlength="60" value={data.user?.name ?? ''} />
			</div>
			<div class="field">
				<label for="username">Username</label>
				<div class="handle-row">
					<span class="at write">@</span>
					<input id="username" name="username" class="line-input" autocapitalize="none" spellcheck="false" maxlength="30" value={data.user?.username ?? ''} />
				</div>
				<p class="meta">
					{#if data.user?.username}Your profile: <a href="/u/{data.user.username}">/u/{data.user.username}</a>{:else}Pick one so friends can find your public lists.{/if}
				</p>
			</div>
			<div class="field">
				<label for="currency">Currency</label>
				<select id="currency" name="currency" class="line-input select">
					{#each CURRENCIES as c (c)}<option value={c} selected={(data.user?.currency ?? 'GBP') === c}>{c}</option>{/each}
				</select>
				<p class="meta">New items and Secret Santas start in this currency. You can still change it on each one.</p>
			</div>
			<div class="field">
				<span class="label">Email</span>
				<p class="write email">{data.user?.email}</p>
			</div>
			{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
			{#if form?.usernameError}<p class="field-error" role="alert">{form.usernameError}</p>{/if}
			<div class="row-actions">
				<button class="btn btn-dark btn-md">Save</button>
				{#if form?.saved}<span class="meta" role="status">Saved.</span>{/if}
			</div>
		</form>
	</Sheet>

	<Sheet margin={false} padding="24px">
		<h2 class="hand h2" id="emails">Emails</h2>
		<p class="copy">
			Sign-in codes, invites and Secret Santa draws always come through. These reminders are up to you.
		</p>
		<form method="POST" action="?/emails" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<ul class="prefs">
				{#each data.emails as e (e.kind)}
					<li>
						<label>
							<input type="checkbox" name={e.kind} checked={e.on} />
							<span>{e.label}</span>
						</label>
					</li>
				{/each}
			</ul>
			<div class="row-actions">
				<button class="btn btn-outline">Save emails</button>
				{#if form?.emailsSaved}<span class="meta" role="status">Saved.</span>{/if}
			</div>
		</form>
	</Sheet>

	<Sheet margin={false} padding="24px">
		<h2 class="hand h2">Passkeys</h2>
		<p class="copy">Log in with your fingerprint, face or device PIN instead of waiting for a code.</p>
		<ul class="keys">
			{#each passkeys as k (k.id)}
				<li>
					<span><Icon name="key" />{k.name || 'Passkey'}</span>
					<button class="btn btn-text" onclick={() => remove(k.id)}>Remove</button>
				</li>
			{/each}
		</ul>
		<button class="btn btn-outline" onclick={add}><Icon name="key" />Add a passkey</button>
		{#if note}<p class="meta" role="status">{note}</p>{/if}
	</Sheet>
</main>

<style>
	.page {
		padding-top: 40px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 28px;
		max-width: 720px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.h2 {
		margin: 0 0 8px;
		font-size: 32px;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.handle-row {
		display: flex;
		align-items: flex-end;
		gap: 4px;
	}
	.at {
		font-size: 22px;
		color: var(--muted);
		padding-bottom: 8px;
	}
	.email {
		margin: 4px 0 0;
		font-size: 22px;
	}
	.meta {
		margin: 4px 0 0;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.copy {
		margin: 0 0 12px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.prefs {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
	}
	.prefs li {
		border-bottom: 1px solid var(--rule);
	}
	.prefs label {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 44px;
		font-size: 15px;
		cursor: pointer;
	}
	.prefs input {
		width: 18px;
		height: 18px;
		accent-color: var(--gold);
		flex: none;
	}
	.keys {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
	}
	.keys li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid var(--rule);
		min-height: 44px;
	}
	.keys span {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 15px;
	}
	@media (max-width: 520px) {
		.page :global(.sheet) {
			padding: 32px 18px 24px 46px !important;
		}
		.page :global(.sheet > .margin) {
			left: 28px !important;
		}
	}
</style>
