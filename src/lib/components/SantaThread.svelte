<script lang="ts">
	/** One anonymous Secret Santa conversation: with the person you drew, or with your own Santa. */
	import { enhance } from '$app/forms';
	import type { ThreadMessage } from '#lib/server/santaMessages';

	interface Props {
		title: string;
		intro: string;
		/** Who the other side's messages are shown as. */
		themLabel: string;
		messages: ThreadMessage[];
		/** 'recipient' = to the person I drew; 'santa' = to whoever drew me. */
		to: 'recipient' | 'santa';
		placeholder: string;
		error?: string | null;
	}
	let { title, intro, themLabel, messages, to, placeholder, error = null }: Props = $props();
	let busy = $state(false);
	let text = $state('');
	const id = $props.id();

	const when = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
</script>

<section class="thread">
	<h3 class="write title">{title}</h3>
	{#if messages.length}
		<ol class="messages">
			{#each messages as m (m.id)}
				<li class:mine={m.mine}>
					<p class="body">{m.body}</p>
					<p class="meta">{m.mine ? 'You' : themLabel} · {when(m.at)}</p>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="copy">{intro}</p>
	{/if}
	<form
		method="POST"
		action="?/message"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') text = '';
				busy = false;
			};
		}}
	>
		<input type="hidden" name="to" value={to} />
		<label for="{id}-msg" class="sr-only">{title}</label>
		<textarea id="{id}-msg" name="body" class="line-input area" rows="2" maxlength="1000" {placeholder} bind:value={text}></textarea>
		{#if error}<p class="field-error" role="alert">{error}</p>{/if}
		<button class="btn btn-dark btn-md" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
	</form>
</section>

<style>
	.thread {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.title {
		margin: 0;
		font-size: 22px;
	}
	.copy {
		margin: 0;
		font-size: 14px;
		line-height: 1.5;
		color: var(--ink2);
	}
	.messages {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-height: 320px;
		overflow: auto;
	}
	.messages li {
		max-width: 88%;
		padding: 8px 12px;
		border-radius: 4px;
		background: var(--gold-soft);
		align-self: flex-start;
	}
	.messages li.mine {
		align-self: flex-end;
		background: color-mix(in srgb, var(--ink) 7%, transparent);
	}
	.body {
		margin: 0;
		font-size: 15px;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.messages .meta {
		margin: 2px 0 0;
		font-size: 12px;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	form .btn {
		align-self: flex-start;
	}
	.area {
		height: auto;
		min-height: 44px;
		padding-top: 8px;
		resize: vertical;
		font-size: 18px;
		line-height: 1.4;
	}
</style>
