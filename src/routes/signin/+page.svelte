<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { authClient } from '#lib/auth-client';
	import Logo from '#lib/components/ui/Logo.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';

	let { data } = $props();

	let step = $state<'email' | 'code'>('email');
	let email = $state('');
	let code = $state('');
	let busy = $state(false);
	let error = $state('');
	let codeInput = $state<HTMLInputElement>();

	async function finish(name: string | undefined) {
		await invalidateAll();
		await goto(name ? data.next : `/welcome?next=${encodeURIComponent(data.next)}`);
	}

	async function sendCode(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		busy = true;
		const res = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'sign-in' });
		busy = false;
		if (res.error) {
			error = res.error.message ?? "We couldn't send a code to that address. Check it and try again.";
			return;
		}
		step = 'code';
		queueMicrotask(() => codeInput?.focus());
	}

	async function verify(e: SubmitEvent) {
		e.preventDefault();
		error = '';
		if (code.length !== 6) {
			error = 'Enter the 6-digit code from the email.';
			return;
		}
		busy = true;
		const res = await authClient.signIn.emailOtp({ email: email.trim(), otp: code });
		busy = false;
		if (res.error) {
			error = 'That code is wrong or has expired. Check the latest email, or send a new code.';
			return;
		}
		await finish(res.data?.user?.name);
	}

	async function passkey() {
		error = '';
		busy = true;
		const res = await authClient.signIn.passkey();
		busy = false;
		if (res?.error) {
			error = "Passkey sign-in didn't complete. Try again, or use an email code.";
			return;
		}
		await invalidateAll();
		await goto(data.next);
	}
</script>

<svelte:head><title>Log in — Wishlist</title></svelte:head>

<div class="page">
	<header class="container top">
		<Logo />
	</header>

	<main>
		<Sheet tape margin={40} padding="44px 40px 36px 64px" class="login">
			{#if step === 'email'}
				<h1 class="hand">Welcome</h1>
				<p class="sub">Log in or create an account — we'll email you a code, no password needed.</p>

				<form onsubmit={sendCode} class="stack">
					<div class="field">
						<label for="email">Email</label>
						<input
							id="email"
							class="line-input"
							type="email"
							autocomplete="email webauthn"
							placeholder="you@example.com"
							required
							bind:value={email}
						/>
					</div>
					{#if error}<p class="field-error" role="alert">{error}</p>{/if}
					<button class="btn btn-primary btn-block submit" disabled={busy}>Email me a code</button>
				</form>

				<div class="or"><span></span>or<span></span></div>

				<button class="btn btn-outline btn-block alt" onclick={passkey} disabled={busy}>
					<Icon name="key" />Log in with a passkey
				</button>
			{:else}
				<h1 class="hand">Check your email</h1>
				<p class="sub">We sent a 6-digit code to <strong>{email}</strong>. It expires in 10 minutes.</p>

				<form onsubmit={verify} class="stack">
					<div class="field">
						<label for="code">Code</label>
						<input
							id="code"
							class="line-input code"
							inputmode="numeric"
							autocomplete="one-time-code"
							placeholder="123456"
							required
							bind:this={codeInput}
							bind:value={() => code, (v) => (code = v.replace(/\D/g, '').slice(0, 6))}
						/>
					</div>
					{#if error}<p class="field-error" role="alert">{error}</p>{/if}
					<button class="btn btn-primary btn-block submit" disabled={busy}>Log in</button>
				</form>

				<div class="links">
					<button class="btn btn-text" onclick={() => ((step = 'email'), (code = ''), (error = ''))}
						>Use a different email</button
					>
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
	main :global(.login) {
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
	.code {
		letter-spacing: 0.3em;
		font-size: 28px;
	}
	.or {
		display: flex;
		align-items: center;
		gap: 14px;
		margin: 26px 0;
		color: var(--muted);
		font-size: 13px;
	}
	.or span {
		flex: 1;
		height: 1px;
		background: var(--line);
	}
	.alt {
		height: 48px;
		font-size: 15px;
	}
	.links {
		margin-top: 18px;
		display: flex;
		justify-content: center;
	}
	@media (max-width: 480px) {
		main :global(.login) {
			padding: 40px 22px 32px 46px !important;
		}
		main :global(.login .margin) {
			left: 26px !important;
		}
	}
</style>
