<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	let { data, form } = $props();
	let busy = $state(false);
	let passkeyError = $state('');

	async function addPasskey() {
		passkeyError = '';
		busy = true;
		const res = await authClient.passkey.addPasskey();
		busy = false;
		if (res?.error) {
			passkeyError = "The passkey wasn't saved. You can add one later from your account menu.";
			return;
		}
		await goto(data.next);
	}
</script>

<svelte:head><title>Welcome — Wishlist</title></svelte:head>

<div class="page">
	<header class="container top"><Logo href="/lists" /></header>
	<main>
		<Sheet tape margin={40} padding="44px 40px 36px 64px" class="card">
			{#if !form?.saved}
				<h1 class="hand">Nice to meet you</h1>
				<p class="sub">What should friends call you? It's shown on your lists and in Secret Santa.</p>
				<form
					method="POST"
					class="stack"
					use:enhance={() => {
						busy = true;
						return async ({ update }) => {
							await update({ reset: false });
							busy = false;
						};
					}}
				>
					<div class="field">
						<label for="name">Your name</label>
						<input
							id="name"
							name="name"
							class="line-input"
							autocomplete="name"
							required
							maxlength="60"
							value={form?.name ?? data.name ?? ''}
						/>
					</div>
					{#if form?.error}<p class="field-error" role="alert">{form.error}</p>{/if}
					<div class="field">
						<label for="username">Username <span class="opt">(for your profile link — optional)</span></label>
						<div class="handle-row">
							<span class="at write">@</span>
							<input
								id="username"
								name="username"
								class="line-input"
								autocapitalize="none"
								autocomplete="username"
								spellcheck="false"
								maxlength="30"
								value={form?.username ?? data.username ?? ''}
							/>
						</div>
						<p class="meta">Friends can find your public lists at /u/your-username.</p>
					</div>
					{#if form?.usernameError}<p class="field-error" role="alert">{form.usernameError}</p>{/if}
					<button class="btn btn-primary btn-block submit" disabled={busy}>Continue</button>
				</form>
			{:else}
				<h1 class="hand">One more thing</h1>
				<p class="sub">
					Add a passkey to log in with your fingerprint, face or device PIN next time — no code to
					wait for.
				</p>
				<div class="stack">
					<button class="btn btn-primary btn-block submit" onclick={addPasskey} disabled={busy}>
						<Icon name="key" />Add a passkey
					</button>
					{#if passkeyError}<p class="field-error" role="alert">{passkeyError}</p>{/if}
					<a class="btn btn-text skip" href={data.next}>Skip for now</a>
				</div>
			{/if}
		</Sheet>
	</main>
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.top {
		width: 100%;
		max-width: 1200px;
		padding-top: 24px;
		padding-bottom: 24px;
	}
	main {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 20px 80px;
	}
	main :global(.card) {
		width: 100%;
		max-width: 460px;
	}
	h1 {
		margin: 0;
		font-size: 52px;
	}
	.sub {
		margin: 8px 0 28px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.submit {
		height: 52px;
		font-size: 16px;
	}
	.skip {
		align-self: center;
	}
	.opt {
		font-weight: 400;
		color: var(--muted);
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
	.meta {
		margin: 4px 0 0;
	}
</style>
