<script lang="ts">
	import StickyNote from '#lib/components/ui/StickyNote.svelte';
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { formatDate, plural, tiltFor } from '#lib/format';
	import type { SantaSummary } from '#lib/server/santa';

	let { s }: { s: SantaSummary } = $props();
	const meta = $derived(
		[s.budget ? `Budget ${s.budget}` : null, s.exchangeDate ? `swap on ${formatDate(s.exchangeDate)}` : null]
			.filter(Boolean)
			.join(' · ')
	);
</script>

{#if s.recipient}
	<StickyNote tilt={1.2}>
		<p class="eyebrow">{s.name} · names drawn</p>
		<p class="hand big">You're buying for {s.recipient.name}</p>
		{#if meta}<p class="sub">{meta}</p>{/if}
		<div class="actions">
			{#if s.recipient.listId}
				<a href="/lists/{s.recipient.listId}" class="btn btn-dark"
					>See {s.recipient.name}'s list<Icon name="arrow-right" size={16} strokeWidth={2} /></a
				>
			{/if}
			<a href="/santa/{s.id}" class="btn btn-text">Details</a>
		</div>
	</StickyNote>
{:else}
	<Sheet margin={false} tilt={tiltFor(s.id) / 6} padding="22px 24px" style="border-top: 3px solid var(--gold)">
		<p class="eyebrow">{s.status === 'drawn' ? 'Names drawn' : s.isOrganiser ? 'You organise this' : "You're in"}</p>
		<p class="hand title">{s.name}</p>
		<p class="sub">{plural(s.memberCount, 'person', 'people')} joined{meta ? ` · ${meta}` : ''}</p>
		<a href="/santa/{s.id}" class="btn btn-primary">Open</a>
	</Sheet>
{/if}

<style>
	.eyebrow {
		margin: 0;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--gold-text);
	}
	.big {
		margin: 8px 0 0;
		font-size: 34px;
		line-height: 1.05;
	}
	.title {
		margin: 8px 0 0;
		font-size: 32px;
		line-height: 1.05;
	}
	.sub {
		margin: 8px 0 16px;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
	.actions .btn-dark {
		height: 42px;
	}
</style>
