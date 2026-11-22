<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { plural } from '#lib/format';
	import { pop } from '#lib/motion';

	let { data, form } = $props();
	const g = $derived(data.group);
	const joinLink = $derived(`${page.url.origin}/groups/join/${g.joinToken}`);
	const me = $derived(data.user?.id);

	let copied = $state(false);
	async function copy() {
		try {
			await navigator.clipboard.writeText(joinLink);
			copied = true;
			setTimeout(() => (copied = false), 1800);
		} catch {
			/* field stays selectable */
		}
	}

	let renaming = $state(false);
	let busy = $state(false);
	const busyEnhance = () => {
		busy = true;
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: result.type === 'success' });
			busy = false;
			if (result.type === 'success') renaming = false;
		};
	};
	const confirmFirst =
		(message: string) =>
		({ cancel }: { cancel: () => void }) => {
			if (!confirm(message)) {
				cancel();
				return;
			}
			return busyEnhance();
		};
</script>

<svelte:head><title>{g.name} — Groups</title></svelte:head>

<main class="container page">
	<a href="/friends#groups" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />Friends</a>

	<div class="with-aside">
		<Sheet tape margin={50} padding="40px 40px 32px 76px" class="main-col sheet">
			{#if renaming}
				<form method="POST" action="?/rename" class="rename" use:enhance={busyEnhance}>
					<label for="group-name" class="label">Group name</label>
					<input id="group-name" name="name" class="line-input" maxlength="80" value={g.name} required autocomplete="off" />
					<div class="row">
						<button class="btn btn-dark btn-md" disabled={busy}>Save</button>
						<button type="button" class="btn btn-text" onclick={() => (renaming = false)}>Cancel</button>
					</div>
					{#if form?.renameError}<p class="field-error" role="alert">{form.renameError}</p>{/if}
				</form>
			{:else}
				<div class="title-row">
					<h1 class="hand">{g.name}</h1>
					{#if data.isOwner}
						<button type="button" class="btn btn-icon" aria-label="Rename {g.name}" onclick={() => (renaming = true)}><Icon name="edit" /></button>
					{/if}
				</div>
			{/if}
			<p class="meta count">{plural(data.members.length, 'person', 'people')} in this group</p>

			<ul class="members">
				{#each data.members as m (m.id)}
					<li class="member">
						<Avatar name={m.name} />
						<span class="who">
							<span class="write">{m.name}{m.id === me ? ' (you)' : ''}</span>
							<span class="meta">{m.username ? `@${m.username}` : ''}{m.id === data.ownerId ? `${m.username ? ' · ' : ''}runs the group` : ''}</span>
						</span>
						{#if m.username && m.id !== me}<a class="btn btn-text" href="/u/{m.username}">Lists</a>{/if}
						{#if data.isOwner && m.id !== me}
							<form method="POST" action="?/remove" use:enhance={confirmFirst(`Remove ${m.name} from ${g.name}?`)}>
								<input type="hidden" name="userId" value={m.id} />
								<button class="btn btn-icon" aria-label="Remove {m.name}" disabled={busy}><Icon name="trash" size={16} /></button>
							</form>
						{/if}
					</li>
				{/each}
			</ul>

			<p class="copy tip">
				To share a list with everyone here, open the list, choose <strong>Share</strong>, and pick {g.name}.
			</p>
		</Sheet>

		<aside>
			<Sheet margin={false} padding="24px">
				<h2 class="hand h2">Invite people</h2>
				<p class="copy">Anyone with this link can join.</p>
				<div class="link-row">
					<input class="line-input link" readonly value={joinLink} aria-label="Join link" onfocus={(e) => e.currentTarget.select()} />
					<button type="button" class="btn btn-outline" onclick={copy}
						>{#key copied}<span class="copy-label" in:pop>{#if copied}<Icon name="tick" size={16} strokeWidth={2.4} />Copied{:else}Copy{/if}</span>{/key}</button
					>
				</div>
				{#if data.isOwner}
					<form method="POST" action="?/resetLink" use:enhance={confirmFirst('Make a new link? The old one will stop working.')}>
						<button class="btn btn-text small" disabled={busy}>Make a new link</button>
					</form>
				{/if}

				<form method="POST" action="?/invite" class="invite" use:enhance={busyEnhance}>
					<label for="invite-email" class="label">Or send an invite by email</label>
					<div class="link-row">
						<input id="invite-email" name="email" type="email" class="line-input" placeholder="sam@example.com" required />
						<button class="btn btn-dark" disabled={busy}>Send</button>
					</div>
					{#if form?.inviteError}<p class="field-error" role="alert">{form.inviteError}</p>{/if}
					{#if form?.invited}<p class="meta sent" role="status">Invite sent to {form.invited}.</p>{/if}
				</form>
			</Sheet>

			<div class="danger">
				<form
					method="POST"
					action="?/leave"
					use:enhance={confirmFirst(
						data.members.length === 1
							? `Leave ${g.name}? You're the only one in it, so it will be deleted.`
							: `Leave ${g.name}?${data.isOwner ? ' Someone else in it will take over running it.' : ''}`
					)}
				>
					<button class="btn btn-text" disabled={busy}>Leave group</button>
				</form>
				{#if data.isOwner}
					<form method="POST" action="?/delete" use:enhance={confirmFirst(`Delete ${g.name} for everyone? Lists already shared stay shared.`)}>
						<button class="btn btn-text" disabled={busy}>Delete group</button>
					</form>
				{/if}
			</div>
		</aside>
	</div>
</main>

<style>
	.page {
		padding-top: 24px;
		padding-bottom: 96px;
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 1140px;
	}
	.back {
		align-self: flex-start;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 14px;
		color: var(--ink2);
		text-decoration: none;
		min-height: 44px;
	}
	.title-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	h1 {
		margin: 0;
		font-size: clamp(48px, 6vw, 72px);
		line-height: 0.95;
		overflow-wrap: anywhere;
	}
	.count {
		margin: 8px 0 20px;
		font-size: 15px;
	}
	.rename {
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 480px;
	}
	.rename input {
		font-size: 28px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.members {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.member {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 0;
		border-bottom: 1px solid var(--rule);
	}
	.who {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.who .write {
		font-size: 21px;
		overflow-wrap: anywhere;
	}
	.copy {
		margin: 4px 0 12px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.tip {
		margin-top: 20px;
	}
	.h2 {
		margin: 0;
		font-size: 30px;
	}
	.link-row {
		display: flex;
		gap: 10px;
		align-items: flex-end;
	}
	.link-row input {
		flex: 1;
		min-width: 0;
		font-size: 15px;
		font-family: var(--font-ui);
	}
	.copy-label {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.small {
		font-size: 14px;
		margin-top: 6px;
	}
	.invite {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sent {
		margin: 6px 0 0;
		font-size: 14px;
	}
	.danger {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		padding: 12px 4px;
	}
	aside {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 24px 16px 20px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
