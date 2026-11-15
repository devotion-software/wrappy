<script lang="ts">
	import { enhance } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import AddGiftForm from '#lib/components/AddGiftForm.svelte';
	import { plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
	const isRevealed = (id: string) => data.revealed.includes(id);
	const giftsFrom = (id: string) => [
		...data.fromLists.filter((g) => g.giverId === id).map((g) => g.title),
		...data.noted.filter((g) => g.giverId === id).map((g) => g.title)
	];
	const anyLeft = $derived(data.people.some((p) => !isRevealed(p.id)));
</script>

<svelte:head><title>Presents received — Wishlist</title></svelte:head>

<main class="container page">
	<div>
		<h1 class="hand">Presents received</h1>
		<p class="sub">
			Tick off who you've opened presents from. You'll then see what they marked as bought from your lists, and you
			can note anything else they gave you.
		</p>
	</div>

	<Sheet tape margin={50} padding="22px 28px 22px 72px" class="sheet">
		{#each data.people as p (p.id)}
			{@const gifts = giftsFrom(p.id)}
			{@const first = p.name.split(' ')[0]}
			<div class="person">
				<div class="person-head">
					<form method="POST" action={isRevealed(p.id) ? '?/undo' : '?/received'} use:enhance>
						<input type="hidden" name="giverId" value={p.id} />
						<button
							class="tick-btn"
							aria-pressed={isRevealed(p.id)}
							aria-label="{isRevealed(p.id) ? 'Unmark' : 'Mark'} received from {p.name}"
						>
							<Checkbox checked={isRevealed(p.id)} tilt={tiltFor(p.id)} />
						</button>
					</form>
					<Avatar name={p.name} size={36} />
					<div class="who">
						<p class="write name">{p.name}</p>
						{#if isRevealed(p.id)}
							{#if gifts.length}
								<p class="note">got you {gifts.join(', ')}</p>
							{:else}
								<p class="meta">Nothing noted from {first} yet.</p>
							{/if}
						{/if}
					</div>
					{#if isRevealed(p.id)}
						<a href="/gifts/{p.id}" class="btn btn-outline see-all"
							>{gifts.length ? `See all ${gifts.length}` : 'Open'}</a
						>
					{/if}
				</div>
				{#if isRevealed(p.id)}
					<div class="add">
						<AddGiftForm
							giverId={p.id}
							giverFirstName={first}
							error={form?.giftError?.giverId === p.id ? form.giftError.message : null}
						/>
					</div>
				{/if}
			</div>
		{:else}
			<p class="empty">Once people open your lists, they'll appear here.</p>
		{/each}

		{#if anyLeft}
			<form method="POST" action="?/receivedAll" use:enhance class="all">
				<button class="btn btn-primary btn-md">Received from everyone</button>
			</form>
		{/if}
	</Sheet>
	{#if data.revealed.length}
		<p class="meta">{plural(data.revealed.length, 'person', 'people')} ticked off.</p>
	{/if}

	<section class="others">
		<div>
			<h2 class="hand h2">Not on Wishlist</h2>
			<p class="sub">Keep track of presents from people without an account, like grandparents or neighbours. Only you can see these.</p>
		</div>
		<Sheet margin={50} padding="18px 28px 22px 72px" class="sheet">
			{#each data.contacts as c (c.id)}
				{@const gifts = data.contactGifts.filter((g) => g.giverId === c.id).map((g) => g.title)}
				{@const first = c.name.split(' ')[0]}
				<div class="person">
					<div class="person-head">
						<span class="tick-space"><Checkbox checked={gifts.length > 0} tilt={tiltFor(c.id)} /></span>
						<Avatar name={c.name} size={36} />
						<div class="who">
							<p class="write name">{c.name}</p>
							{#if gifts.length}
								<p class="note">got you {gifts.join(', ')}</p>
							{:else}
								<p class="meta">Nothing noted from {first} yet.</p>
							{/if}
						</div>
						<a href="/gifts/{c.id}" class="btn btn-outline see-all">{gifts.length ? `See all ${gifts.length}` : 'Open'}</a>
					</div>
					<div class="add">
						<AddGiftForm
							giverId={c.id}
							isContact
							giverFirstName={first}
							error={form?.giftError?.giverId === c.id ? form.giftError.message : null}
						/>
					</div>
				</div>
			{/each}

			<form method="POST" action="?/addContact" class="new-person" use:enhance>
				<p class="label">Add someone</p>
				<div class="new-row">
					<div class="field">
						<label for="contact-name" class="sr-only">Their name</label>
						<input id="contact-name" name="name" class="line-input" maxlength="80" placeholder="Their name" required autocomplete="off" />
					</div>
					<div class="field grow">
						<label for="contact-gift" class="sr-only">What they gave you (optional)</label>
						<input id="contact-gift" name="title" class="line-input" maxlength="200" placeholder="What they gave you (optional)" autocomplete="off" />
					</div>
					<button class="btn btn-dark">Add</button>
				</div>
				{#if form?.contactError}<p class="field-error" role="alert">{form.contactError}</p>{/if}
			</form>
		</Sheet>
	</section>
</main>

<style>
	.page {
		padding-top: 48px;
		padding-bottom: 80px;
		display: flex;
		flex-direction: column;
		gap: 28px;
		max-width: 820px;
	}
	h1 {
		margin: 0;
		font-size: 60px;
	}
	.sub {
		margin: 8px 0 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--ink2);
		max-width: 620px;
	}
	.person {
		padding: 14px 0;
		border-bottom: 1px solid var(--rule);
	}
	.person-head {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.tick-btn {
		width: 44px;
		height: 44px;
		border: 0;
		background: none;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		padding: 0;
	}
	.who {
		flex: 1;
		min-width: 0;
	}
	.who p {
		margin: 0;
	}
	.name {
		font-size: 22px;
	}
	.note {
		font-size: 20px;
	}
	.see-all {
		flex: none;
	}
	.add {
		padding: 4px 0 2px 58px;
	}
	.empty {
		margin: 0;
		padding: 16px 0;
		font-size: 15px;
		color: var(--ink2);
	}
	.all {
		padding-top: 18px;
	}
	.others {
		display: flex;
		flex-direction: column;
		gap: 16px;
		margin-top: 12px;
	}
	.h2 {
		margin: 0;
		font-size: 40px;
	}
	/* Contacts have no "received" toggle; keep their rows aligned with the ones above. */
	.tick-space {
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
	}
	.new-person {
		padding-top: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.new-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px 16px;
	}
	.new-row .field {
		flex: 1 1 160px;
		min-width: 0;
	}
	.new-row .grow {
		flex: 2 1 220px;
	}
	.new-row input {
		font-size: 20px;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 18px 16px 18px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
		.add {
			padding-left: 0;
		}
		.person-head {
			flex-wrap: wrap;
		}
	}
</style>
