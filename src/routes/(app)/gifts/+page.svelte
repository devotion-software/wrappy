<script lang="ts">
	import { enhance } from '$app/forms';
	import { ask } from '#lib/confirm.svelte';
	import type { SubmitFunction } from '$app/forms';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Avatar from '#lib/components/ui/Avatar.svelte';
	import AddGiftForm from '#lib/components/AddGiftForm.svelte';
	import ThankedToggle from '#lib/components/ThankedToggle.svelte';
	import { formatDate, plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
	const isRevealed = (id: string) => data.revealed.includes(id);
	const giftsFrom = (id: string) => [
		...data.fromLists.filter((g) => g.giverId === id).map((g) => g.title),
		...data.noted.filter((g) => g.giverId === id).map((g) => g.title),
		...data.extras.filter((g) => g.giverId === id).map((g) => g.title)
	];
	const anyLeft = $derived(data.people.some((p) => !isRevealed(p.id)));
	const isThanked = (id: string) => data.thanked.includes(id);
	// Everyone (account or contact) you've got something from but haven't ticked off as thanked.
	const toThank = $derived(
		[...data.people, ...data.contacts].filter((p) => giftsFrom(p.id).length && !isThanked(p.id))
	);
	const anyGifts = $derived([...data.people, ...data.contacts].some((p) => giftsFrom(p.id).length));
	// Marking is permanent, so check before revealing what someone bought.
	const confirmReveal =
		(who: string): SubmitFunction =>
		async ({ cancel }) => {
			const ok = await ask(
				`Only do this once you've opened your presents. You'll see what ${who} marked as bought, and this can't be undone. Presents for an occasion you haven't opened yet stay hidden.`,
				{ yes: "Yes, I've opened them" }
			);
			if (!ok) cancel();
		};
	const confirmOpen =
		(name: string): SubmitFunction =>
		async ({ cancel }) => {
			if (!(await ask(`Opened your ${name} presents? You'll see what was bought for ${name}, and this can't be undone.`, { yes: "Yes, I've opened them" }))) cancel();
		};
</script>

<svelte:head><title>Presents received — Wrappy</title></svelte:head>

<main class="container page">
	<div>
		<h1 class="hand">Presents received</h1>
		<p class="sub">
			Once you've opened your presents, tick off who they were from. You'll then see what they marked as bought from
			your lists, and you can note anything else they gave you. Ticks can't be undone, so the surprise stays safe until
			then.
		</p>
	</div>

	{#if data.occasions.length}
		<section class="occasions">
			<h2 class="hand h2">Occasions</h2>
			<p class="sub">
				For lists with more than one date. Open one to see what was bought for it, without spoiling the others.
			</p>
			<Sheet margin={50} padding="14px 28px 14px 72px" class="sheet">
				{#each data.occasions as o (o.id)}
					<div class="occasion">
						{#if o.opened}
							<span class="tick-btn" role="img" aria-label="{o.name} opened"><Checkbox checked tilt={tiltFor(o.id)} /></span>
						{:else}
							<form method="POST" action="?/openOccasion" use:enhance={confirmOpen(o.name)}>
								<input type="hidden" name="occasionId" value={o.id} />
								<button class="tick-btn" aria-pressed="false" aria-label="Mark {o.name} presents opened">
									<Checkbox checked={false} tilt={tiltFor(o.id)} />
								</button>
							</form>
						{/if}
						<div class="who">
							<p class="write name">{o.name}</p>
							<p class="meta"><a href="/lists/{o.listId}">{o.listTitle}</a> · {formatDate(o.date)}{o.opened ? ' · opened' : ''}</p>
						</div>
					</div>
				{/each}
			</Sheet>
		</section>
	{/if}

	<Sheet tape margin={50} padding="22px 28px 22px 72px" class="sheet">
		{#each data.people as p (p.id)}
			{@const gifts = giftsFrom(p.id)}
			{@const first = p.name.split(' ')[0]}
			<div class="person">
				<div class="person-head">
					{#if isRevealed(p.id)}
						<!-- One-way: unticking would let you peek at what people bought and hide it again. -->
						<span class="tick-btn" role="img" aria-label="Received from {p.name}">
							<Checkbox checked tilt={tiltFor(p.id)} />
						</span>
					{:else}
						<form method="POST" action="?/received" use:enhance={confirmReveal(p.name)}>
							<input type="hidden" name="giverId" value={p.id} />
							<button class="tick-btn" aria-pressed="false" aria-label="Mark received from {p.name}">
								<Checkbox checked={false} tilt={tiltFor(p.id)} />
							</button>
						</form>
					{/if}
					<Avatar name={p.name} size={36} />
					<div class="who">
						<p class="write name">{p.name}</p>
						{#if isRevealed(p.id) || gifts.length}
							{#if gifts.length}
								<p class="note">got you {gifts.join(', ')}</p>
							{:else}
								<p class="meta">Nothing noted from {first} yet.</p>
							{/if}
						{/if}
					</div>
					{#if gifts.length}<ThankedToggle personId={p.id} name={p.name} thanked={isThanked(p.id)} />{/if}
					{#if isRevealed(p.id) || gifts.length}
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
			<form method="POST" action="?/receivedAll" use:enhance={confirmReveal('everyone')} class="all">
				<button class="btn btn-primary btn-md">Received from everyone</button>
			</form>
		{/if}
	</Sheet>
	{#if data.revealed.length || anyGifts}
		<p class="meta">
			{#if data.revealed.length}{plural(data.revealed.length, 'person', 'people')} ticked off.{/if}
			{#if anyGifts}
				{#if toThank.length}
					Still to thank: {toThank.map((p) => p.name.split(' ')[0]).join(', ')}.
				{:else}
					Everyone's been thanked.
				{/if}
			{/if}
		</p>
	{/if}

	<section class="others">
		<div>
			<h2 class="hand h2">Not on Wrappy</h2>
			<p class="sub">Keep track of presents from people without an account, like grandparents or neighbours. Only you can see these.</p>
		</div>
		<Sheet margin={50} padding="18px 28px 22px 72px" class="sheet">
			{#each data.contacts as c (c.id)}
				{@const gifts = giftsFrom(c.id)}
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
						{#if gifts.length}<ThankedToggle personId={c.id} name={c.name} thanked={isThanked(c.id)} />{/if}
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
	.occasion {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 8px 0;
		border-bottom: 1px solid var(--rule);
	}
	.occasion:last-child {
		border-bottom: 0;
	}
	.occasion .meta a {
		color: inherit;
	}
	.occasions,
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
