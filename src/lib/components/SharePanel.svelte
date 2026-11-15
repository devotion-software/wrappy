<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { plural } from '#lib/format';
	import { pop } from '#lib/motion';

	interface Props {
		visibility: 'public' | 'private';
		shareToken: string | null;
		shares: { id: string; email: string; name: string | null }[];
		viewers: { id: string; name: string }[];
		ownerUsername: string | null;
		shareError?: string | null;
	}
	let { visibility, shareToken, shares, viewers, ownerUsername, shareError = null }: Props = $props();

	const link = $derived(shareToken ? `${page.url.origin}/s/${shareToken}` : '');
	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(link);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			/* clipboard blocked — the field is selectable */
		}
	}
	const shown = $derived(viewers.slice(0, 4));
</script>

<Sheet margin={false} padding="24px" class="share">
	<h2 class="hand h">Share this list</h2>
	{#if visibility === 'public'}
		<p class="copy">
			It's public{ownerUsername ? '' : ''} — anyone can find it{#if ownerUsername}
				on <a href="/u/{ownerUsername}">your profile</a>{/if}, view it and reserve gifts.
		</p>
	{:else}
		<p class="copy">Only people you invite, or who have the secret link, can see it.</p>
	{/if}

	{#if shareToken}
		<div class="link-row">
			<label for="sharelink" class="sr-only">Secret link</label>
			<input id="sharelink" readonly value={link} onfocus={(e) => e.currentTarget.select()} />
			<button type="button" class="btn btn-primary btn-md" onclick={copy}
				>{#key copied}<span class="copy-label" in:pop>{#if copied}<Icon name="tick" size={16} strokeWidth={2.4} />Copied{:else}Copy{/if}</span>{/key}</button
			>
		</div>
		<div class="link-actions">
			<form method="POST" action="?/newLink" use:enhance>
				<button class="btn btn-text">Make a new link</button>
			</form>
			<form method="POST" action="?/disableLink" use:enhance>
				<button class="btn btn-text">Turn off link</button>
			</form>
		</div>
		<p class="meta small">A new link stops the old one working for anyone who hasn't opened it yet, and removes access for people who joined through it.</p>
	{:else}
		<form method="POST" action="?/newLink" use:enhance>
			<button class="btn btn-outline">Create a secret link</button>
		</form>
	{/if}

	<form method="POST" action="?/share" class="invite" use:enhance>
		<label for="invite-email" class="label">Invite by email</label>
		<div class="invite-row">
			<input id="invite-email" name="email" type="email" class="line-input" placeholder="sam@example.com" required />
			<button class="btn btn-dark btn-md">Invite</button>
		</div>
		{#if shareError}<p class="field-error" role="alert">{shareError}</p>{/if}
	</form>

	{#if shares.length}
		<ul class="shares">
			{#each shares as s (s.id)}
				<li>
					<span class="who"><span class="write">{s.name || s.email}</span>{#if s.name}<span class="meta">{s.email}</span>{/if}</span>
					<form method="POST" action="?/unshare" use:enhance>
						<input type="hidden" name="shareId" value={s.id} />
						<button class="btn btn-text" aria-label="Remove {s.email}">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	{#if viewers.length}
		<div class="viewers">
			<div class="stack">
				{#each shown as v, i (v.id)}
					<span style="margin-left: {i ? -8 : 0}px"><Avatar name={v.name} size={34} ring /></span>
				{/each}
			</div>
			<span class="copy">{plural(viewers.length, 'person has', 'people have')} opened it</span>
		</div>
	{/if}
</Sheet>

<style>
	.h {
		margin: 0 0 14px;
		font-size: 32px;
	}
	.copy {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.link-row {
		display: flex;
		gap: 8px;
		margin-top: 14px;
	}
	.link-row input {
		flex: 1;
		min-width: 0;
		height: 44px;
		padding: 0 12px;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: var(--desk);
		color: var(--ink);
		font: 14px var(--font-ui);
	}
	.link-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin: 6px 0 0 -8px;
	}
	.small {
		margin: 4px 0 0;
		font-size: 12px;
		line-height: 1.45;
	}
	form {
		margin: 0;
	}
	form:has(> .btn-outline) {
		margin-top: 14px;
	}
	.invite {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.invite-row {
		display: flex;
		gap: 10px;
		align-items: flex-end;
	}
	.invite-row input {
		flex: 1;
		min-width: 0;
		font-size: 20px;
	}
	.shares {
		list-style: none;
		margin: 10px 0 0;
		padding: 0;
	}
	.shares li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 0;
		border-bottom: 1px solid var(--rule);
	}
	.who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.who .write {
		font-size: 19px;
		overflow-wrap: anywhere;
	}
	.viewers {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-top: 16px;
	}
	.stack {
		display: flex;
	}
</style>
