<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import StickyNote from '#lib/components/ui/StickyNote.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import SantaFields from '#lib/components/SantaFields.svelte';
	import { formatDate, formatPrice, plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
	const s = $derived(data.santa);
	const drawn = $derived(s.status === 'drawn');
	const joinLink = $derived(data.organiser ? `${page.url.origin}/santa/join/${data.organiser.joinToken}` : '');
	const onCount = $derived(data.wishes.filter((w) => w.onList).length);

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
	let editing = $state(false);
	let busy = $state(false);
	const busyEnhance = () => {
		busy = true;
		return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head><title>{s.name} — Secret Santa</title></svelte:head>

<main class="container page">
	<a href="/santa" class="back"><Icon name="arrow-left" size={16} strokeWidth={2} />Secret Santa</a>

	<div class="with-aside">
		<Sheet tape margin={50} padding="48px 40px 40px 76px" class="main-col invite">
			<p class="from">{data.isOrganiser ? "You're organising" : `${data.organiserName} invited you to`}</p>
			<h1 class="hand">{s.name}</h1>
			{#if s.description}<p class="write quote">"{s.description}"</p>{/if}

			<div class="facts">
				<div class="fact"><p class="fact-label">Budget</p><p class="write fact-value">{s.budget ?? 'Any'}</p></div>
				<div class="fact">
					<p class="fact-label">Names drawn</p>
					<p class="write fact-value">{drawn ? (formatDate(String(s.drawnAt).slice(0, 10)) ?? 'Yes') : 'Not yet'}</p>
				</div>
				<div class="fact"><p class="fact-label">Gift swap</p><p class="write fact-value">{formatDate(s.exchangeDate) ?? 'To be decided'}</p></div>
			</div>

			{#if data.recipient}
				<div class="note-wrap">
					<StickyNote tilt={-0.6} padding="24px 26px">
						<p class="hand big">You're buying for {data.recipient.name}</p>
						<p class="copy">Only you can see this.{s.budget ? ` Keep it to ${s.budget}.` : ''}</p>
						{#if data.recipient.listId}
							<a href="/lists/{data.recipient.listId}" class="btn btn-dark btn-md"
								>See {data.recipient.name}'s list<Icon name="arrow-right" size={16} strokeWidth={2} /></a
							>
						{/if}
					</StickyNote>
				</div>
			{/if}

			{#if data.me}
				<div class="note-wrap">
					<StickyNote tilt={drawn ? 0.5 : -0.5} padding="24px 26px">
						<p class="hand big">{drawn ? 'Your Santa list' : "You're in!"}</p>
						<p class="copy">
							Tick the wishes your Santa should see{s.budget ? ` — up to ${s.budget} each` : ''}. {drawn
								? 'Your Santa can see this list now.'
								: "You'll find out who you're buying for when names are drawn."}
						</p>
						<div class="wishes">
							{#each data.wishes as w (w.id)}
								<form method="POST" action="?/toggleWish" use:enhance={busyEnhance}>
									<input type="hidden" name="itemId" value={w.id} />
									<input type="hidden" name="on" value={w.onList ? '0' : '1'} />
									<button class="wish" class:dim={!w.fits && !w.onList} disabled={busy || (!w.fits && !w.onList)} aria-pressed={w.onList}>
										<Checkbox checked={w.onList} size={22} tilt={tiltFor(w.id)} />
										<span class="write">{w.title}</span>
										<span class="meta"
											>{w.price === null
												? 'add a price to include'
												: `${formatPrice(w.price, w.currency)}${!w.fits && !w.onList ? (w.currency !== s.currency ? ` · needs a ${s.currency} price` : ' · over budget') : ''}`}</span
										>
									</button>
								</form>
								{#if form?.wishError?.itemId === w.id}<p class="field-error">{form.wishError.message}</p>{/if}
							{:else}
								<p class="meta">You haven't written any wishes yet.</p>
							{/each}
						</div>
						<div class="note-actions">
							{#if data.me.listId}
								<a href="/items/new?list={data.me.listId}" class="btn btn-dark"><Icon name="plus" />New wish with a price</a>
								<a href="/lists/{data.me.listId}" class="btn btn-text">Open my Santa list ({onCount})</a>
							{/if}
							{#if !drawn}
								<form
									method="POST"
									action="?/leave"
									onsubmit={(e) => {
										if (!confirm('Leave this Secret Santa?')) e.preventDefault();
									}}
								>
									<button class="btn btn-text">Leave the exchange</button>
								</form>
							{/if}
						</div>
					</StickyNote>
				</div>
			{:else if !drawn}
				<form method="POST" action="?/join" class="join" use:enhance={busyEnhance}>
					<button class="btn btn-primary btn-lg" disabled={busy}>Count me in</button>
					<span class="meta">You're organising but not taking part yet.</span>
				</form>
			{/if}

			{#if data.isOrganiser}
				<div class="organiser">
					{#if !drawn}
						<form
							method="POST"
							action="?/draw"
							use:enhance={busyEnhance}
							onsubmit={(e) => {
								if (!confirm(`Draw names for ${plural(data.members.length, 'person', 'people')}? Everyone gets an email, and no one can join after this.`))
									e.preventDefault();
							}}
						>
							<button class="btn btn-dark btn-lg" disabled={busy || data.members.length < 3}><Icon name="shuffle" strokeWidth={2} />Draw names</button>
						</form>
						{#if data.members.length < 3}<p class="meta">You need at least 3 people to draw names.</p>{/if}
						{#if form?.drawError}<p class="field-error" role="alert">{form.drawError}</p>{/if}
					{:else}
						<p class="meta">Names were drawn and everyone has been emailed their match.</p>
					{/if}
					<button class="btn btn-text" onclick={() => (editing = !editing)} aria-expanded={editing}>{editing ? 'Close' : 'Edit details'}</button>
				</div>
				{#if editing}
					<form method="POST" action="?/update" class="edit" use:enhance={busyEnhance}>
						<SantaFields values={{ ...s, priceLimit: s.priceLimit }} />
						{#if drawn}<p class="meta">The budget can't change after names are drawn.</p>{/if}
						{#if form?.settingsError}<p class="field-error" role="alert">{form.settingsError}</p>{/if}
						<div class="note-actions">
							<button class="btn btn-dark" disabled={busy}>Save</button>
						</div>
					</form>
					<form
						method="POST"
						action="?/deleteSanta"
						onsubmit={(e) => {
							if (!confirm(`Delete "${s.name}" for everyone? Their wishes stay in their own lists.`)) e.preventDefault();
						}}
					>
						<button class="btn btn-text">Delete this Secret Santa</button>
					</form>
				{/if}
			{/if}
		</Sheet>

		<aside>
			{#if data.organiser && !drawn}
				<Sheet margin={false} padding="24px">
					<h2 class="hand h2">Invite people</h2>
					<p class="copy">Send this link. People log in or sign up, then join.</p>
					<div class="link-row">
						<label for="joinlink" class="sr-only">Join link</label>
						<input id="joinlink" readonly value={joinLink} onfocus={(e) => e.currentTarget.select()} />
						<button type="button" class="btn btn-primary btn-md" onclick={copy}>{copied ? 'Copied' : 'Copy'}</button>
					</div>
				</Sheet>
			{/if}

			<Sheet margin={false} padding="24px">
				<div class="head">
					<h2 class="hand h2">Who's playing</h2>
					<span class="meta">{plural(data.members.length, 'person', 'people')} in</span>
				</div>
				<div class="people">
					{#each data.members as m (m.id)}
						<div class="person">
							<Checkbox checked size={20} tilt={tiltFor(m.id)} />
							<span class="write">{m.name}</span>
							{#if data.isOrganiser && !drawn && m.id !== data.user?.id}
								<form
									method="POST"
									action="?/removeMember"
									use:enhance={busyEnhance}
									onsubmit={(e) => {
										if (!confirm(`Remove ${m.name}?`)) e.preventDefault();
									}}
								>
									<input type="hidden" name="userId" value={m.id} />
									<button class="btn btn-text small" aria-label="Remove {m.name}">Remove</button>
								</form>
							{/if}
						</div>
					{:else}
						<p class="meta">No one has joined yet.</p>
					{/each}
				</div>
			</Sheet>

			{#if data.organiser}
				<Sheet margin={false} padding="24px">
					<h2 class="hand h2">Keep apart</h2>
					<p class="copy">People who shouldn't draw each other, like couples.</p>
					{#each data.organiser.exclusions as e (e.a + e.b)}
						<div class="excl">
							<span class="write">{e.aName} & {e.bName}</span>
							{#if !drawn}
								<form method="POST" action="?/removeExclusion" use:enhance={busyEnhance}>
									<input type="hidden" name="a" value={e.a} />
									<input type="hidden" name="b" value={e.b} />
									<button class="btn btn-text small">Remove</button>
								</form>
							{/if}
						</div>
					{/each}
					{#if !drawn && data.members.length >= 2}
						<form method="POST" action="?/addExclusion" class="excl-form" use:enhance={busyEnhance}>
							<label class="sr-only" for="ex-a">First person</label>
							<select id="ex-a" name="a" class="line-input select">
								{#each data.members as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
							</select>
							<span class="meta">&</span>
							<label class="sr-only" for="ex-b">Second person</label>
							<select id="ex-b" name="b" class="line-input select">
								{#each data.members as m, i (m.id)}<option value={m.id} selected={i === 1}>{m.name}</option>{/each}
							</select>
							<button class="btn btn-outline" disabled={busy}>Add</button>
						</form>
						{#if form?.exclusionError}<p class="field-error" role="alert">{form.exclusionError}</p>{/if}
					{/if}
				</Sheet>
			{/if}

			<div class="how">
				<h2 class="how-title">How it works</h2>
				<div class="step"><span class="hand num">1.</span><p>Join and tick the wishes your Santa should see.</p></div>
				<div class="step"><span class="hand num">2.</span><p>The organiser draws names — nobody gets themselves.</p></div>
				<div class="step"><span class="hand num">3.</span><p>You get an email with your match. Only you can see it.</p></div>
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
	.from {
		margin: 0;
		font-size: 15px;
		color: var(--ink2);
	}
	h1 {
		margin: 6px 0 0;
		font-size: clamp(52px, 6vw, 78px);
		line-height: 0.95;
		overflow-wrap: anywhere;
	}
	.quote {
		margin: 14px 0 0;
		font-size: 22px;
		line-height: 1.4;
		color: var(--ink2);
		white-space: pre-line;
	}
	.facts {
		margin-top: 32px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 0 32px;
	}
	.fact {
		padding: 14px 0;
		border-top: 1px solid var(--rule);
	}
	.fact-label {
		margin: 0;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
	}
	.fact-value {
		margin: 4px 0 0;
		font-size: 24px;
	}
	.note-wrap {
		margin-top: 32px;
	}
	.big {
		margin: 0;
		font-size: 40px;
	}
	.copy {
		margin: 8px 0 16px;
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.wishes {
		display: flex;
		flex-direction: column;
	}
	.wishes form {
		display: contents;
	}
	.wish {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		width: 100%;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		text-align: left;
		cursor: pointer;
		padding: 4px 0;
	}
	.wish .write {
		flex: 1;
		font-size: 21px;
	}
	.wish.dim {
		cursor: not-allowed;
	}
	.wish.dim .write {
		color: var(--faint);
	}
	.wish:disabled:not(.dim) {
		cursor: progress;
	}
	.note-actions {
		margin-top: 16px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 16px;
	}
	.join {
		margin-top: 32px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
	}
	.organiser {
		margin-top: 32px;
		padding-top: 24px;
		border-top: 1px solid var(--rule);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 16px;
	}
	.organiser form {
		margin: 0;
	}
	.edit {
		margin-top: 20px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	aside .h2 {
		margin: 0;
		font-size: 32px;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.people {
		margin-top: 10px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 0;
		border-bottom: 1px solid var(--rule);
		min-height: 44px;
	}
	.person .write {
		flex: 1;
		font-size: 21px;
	}
	.small {
		height: 32px;
		font-size: 13px;
	}
	.link-row {
		display: flex;
		gap: 8px;
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
	.excl {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border-bottom: 1px solid var(--rule);
		min-height: 44px;
	}
	.excl .write {
		font-size: 20px;
	}
	.excl-form {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 8px;
		margin-top: 12px;
	}
	.select {
		flex: 1 1 100px;
		min-width: 0;
		font-family: var(--font-write);
		font-size: 19px;
	}
	.how {
		padding: 0 4px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.how-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
	}
	.step {
		display: flex;
		gap: 12px;
	}
	.num {
		font-size: 28px;
		color: var(--gold-text);
	}
	.step p {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	@media (max-width: 600px) {
		.page :global(.invite) {
			padding: 40px 18px 28px 44px !important;
		}
		.page :global(.invite > .margin) {
			left: 26px !important;
		}
	}
</style>
