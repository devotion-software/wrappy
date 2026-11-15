<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import { formatDate, plural, tiltFor } from '#lib/format';

	let { data } = $props();
	const s = $derived(data.santa);
</script>

<svelte:head><title>{s.name} — Secret Santa invite</title></svelte:head>

<main class="container page">
	<div class="with-aside">
		<Sheet tape margin={50} padding="48px 40px 40px 76px" class="main-col invite">
			<p class="from">{data.organiserName} invited you to</p>
			<h1 class="hand">{s.name}</h1>
			{#if s.description}<p class="write quote">"{s.description}"</p>{/if}

			<div class="facts">
				<div class="fact"><p class="fact-label">Budget</p><p class="write fact-value">{s.budget ?? 'Any'}</p></div>
				<div class="fact"><p class="fact-label">Gift swap</p><p class="write fact-value">{formatDate(s.exchangeDate) ?? 'To be decided'}</p></div>
			</div>

			{#if s.drawn}
				<p class="copy closed">Names have already been drawn for this one, so it's closed to new people.</p>
			{:else}
				<form method="POST" class="actions">
					<button class="btn btn-primary btn-lg">{data.user ? 'Count me in' : 'Log in to join'}</button>
					<a href={data.user ? '/lists' : '/'} class="decline">I can't make it this year</a>
				</form>
			{/if}
		</Sheet>

		<aside>
			<Sheet margin={false} padding="24px">
				<div class="head">
					<h2 class="hand h2">Who's playing</h2>
					<span class="meta">{plural(data.members.length, 'person', 'people')} in</span>
				</div>
				<div class="people">
					{#each data.members as m (m.id)}
						<div class="person"><Checkbox checked size={20} tilt={tiltFor(m.id)} /><span class="write">{m.name}</span></div>
					{:else}
						<p class="meta">Be the first to join.</p>
					{/each}
				</div>
			</Sheet>
			<div class="how">
				<h2 class="how-title">How it works</h2>
				<div class="step"><span class="hand num">1.</span><p>Join and tick the wishes your Santa should see.</p></div>
				<div class="step"><span class="hand num">2.</span><p>{data.organiserName} draws names — nobody gets themselves.</p></div>
				<div class="step"><span class="hand num">3.</span><p>You'll get an email with your match. Only you can see it.</p></div>
			</div>
		</aside>
	</div>
</main>

<style>
	.page {
		padding-top: 32px;
		padding-bottom: 96px;
		max-width: 1140px;
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
	.actions {
		margin-top: 32px;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 12px 20px;
	}
	.decline {
		font-size: 15px;
		color: var(--ink2);
		text-underline-offset: 3px;
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.copy {
		font-size: 15px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.closed {
		margin: 32px 0 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.h2 {
		margin: 0;
		font-size: 32px;
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
	}
	.person .write {
		font-size: 21px;
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
