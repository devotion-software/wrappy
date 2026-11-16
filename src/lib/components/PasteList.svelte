<script lang="ts">
	/**
	 * "Paste a list" panel: paste a note or checklist, preview the items, add them all.
	 * With `trigger` it shows its own "Paste a list" button; without, the parent opens it
	 * (e.g. when a multi-line list is pasted into another input) by setting `text` and `open`.
	 */
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';
	import { MAX_PASTED_WISHES, parsePastedList } from '#lib/pasteList';
	import { formatPrice, plural } from '#lib/format';

	interface Props {
		/** Where the items go, used in the copy ("to Christmas"). */
		target?: string | null;
		open?: boolean;
		text?: string;
		/** Show the "Paste a list" button that opens the panel. */
		trigger?: boolean;
	}
	let { target = null, open = $bindable(false), text = $bindable(''), trigger = true }: Props = $props();

	let busy = $state(false);
	let error = $state<string | null>(null);
	let done = $state<{ added: number; skipped: string[] } | null>(null);

	const items = $derived(parsePastedList(text));
	const tooMany = $derived(items.length > MAX_PASTED_WISHES);
	const id = $props.id();

	const submit = () => {
		busy = true;
		error = null;
		done = null;
		return async ({ result, update }: { result: { type: string; data?: Record<string, unknown> }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			if (result.type === 'success' && result.data?.pasted) {
				done = result.data.pasted as { added: number; skipped: string[] };
				text = '';
				if (!trigger) open = false;
			} else if (result.type === 'failure') {
				error = String(result.data?.importError ?? 'Something went wrong. Try again.');
			}
			await update({ reset: false });
			busy = false;
		};
	};
</script>

{#snippet panel()}
	<form method="POST" action="?/importList" class="panel" use:enhance={submit}>
		<p class="hand panel-title">Paste a list</p>
		<p class="copy">
			Copy a list from your notes or a message and paste it here, one item per line. Bullets, numbers and checkboxes are
			tidied away, and links and prices are kept.
		</p>
		<label for="{id}-list" class="sr-only">Your list</label>
		<textarea
			id="{id}-list"
			name="list"
			class="line-input area"
			rows="6"
			maxlength="50000"
			placeholder={'- [ ] Cosy socks\n- [ ] A good book £12\n- [ ] https://shop.example.com/scarf'}
			bind:value={text}
		></textarea>

		{#if items.length}
			<div class="preview">
				<p class="label">{plural(items.length, 'item')} found</p>
				<ol>
					{#each items.slice(0, MAX_PASTED_WISHES) as w, i (i)}
						<li>
							<span class="write">{w.title}</span>
							{#if w.price || w.url}
								<span class="meta">
									{formatPrice(w.price, w.currency ?? 'GBP') ?? ''}
									{#if w.url}<Icon name="link" size={14} label="Has a link" />{/if}
								</span>
							{/if}
						</li>
					{/each}
				</ol>
			</div>
		{/if}

		{#if tooMany}<p class="field-error" role="alert">You can add up to {MAX_PASTED_WISHES} items at a time.</p>{/if}
		{#if error}<p class="field-error" role="alert">{error}</p>{/if}
		{#if done}
			<p class="meta ok" role="status">
				{done.added ? `Added ${plural(done.added, 'item')}${target ? ` to ${target}` : ''}.` : 'Nothing was added.'}
				{#if done.skipped.length}Left out: {done.skipped.join(' ')}{/if}
			</p>
		{/if}

		<div class="actions">
			<button class="btn btn-dark" disabled={busy || !items.length || tooMany}
				>{busy ? 'Adding…' : items.length ? `Add ${plural(items.length, 'item')}` : 'Add items'}</button
			>
			<button type="button" class="btn btn-text" onclick={() => (open = false)}>Close</button>
		</div>
	</form>
{/snippet}

{#if trigger}
	<details class="paste" bind:open>
		<summary class="btn btn-text"><Icon name="list" />Paste a list</summary>
		{@render panel()}
	</details>
{:else if open || done}
	<div class="paste">
		{#if open}{@render panel()}{:else if done}<p class="meta ok" role="status">
				{done.added ? `Added ${plural(done.added, 'item')}${target ? ` to ${target}` : ''}.` : 'Nothing was added.'}
				{#if done.skipped.length}Left out: {done.skipped.join(' ')}{/if}
			</p>{/if}
	</div>
{/if}

<style>
	.paste summary {
		list-style: none;
		padding-left: 0;
		cursor: pointer;
		gap: 6px;
	}
	.paste summary::-webkit-details-marker {
		display: none;
	}
	.paste[open] summary {
		display: none;
	}
	.panel {
		margin: 8px 0 4px;
		padding: 20px 22px;
		background: var(--gold-soft);
		transform: rotate(-0.4deg);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.panel-title {
		margin: 0;
		font-size: 34px;
	}
	.copy {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.area {
		height: auto;
		min-height: 120px;
		padding-top: 8px;
		resize: vertical;
		font-size: 20px;
		line-height: 1.4;
	}
	.preview ol {
		margin: 6px 0 0;
		padding: 0;
		list-style: none;
		max-height: 260px;
		overflow: auto;
	}
	.preview li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 0;
		border-bottom: 1px solid var(--rule);
	}
	.preview .write {
		font-size: 19px;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.preview .meta {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}
</style>
