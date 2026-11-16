<script lang="ts">
	import { enhance } from '$app/forms';

	/**
	 * "From someone else?" — move a present to the person who really gave it.
	 * Pick anyone you know (account or not), or type a new name.
	 */
	interface Props {
		kind: 'list' | 'noted';
		id: string;
		title: string;
		others: { id: string; name: string; isContact: boolean }[];
		error?: string | null;
	}
	let { kind, id, title, others, error = null }: Props = $props();

	let open = $state(false);
	let to = $state('');
	const accounts = $derived(others.filter((o) => !o.isContact));
	const contacts = $derived(others.filter((o) => o.isContact));
	let busy = $state(false);
</script>

{#if !open}
	<button type="button" class="btn btn-text toggle" onclick={() => (open = true)} aria-label="Change who {title} was from"
		>From someone else?</button
	>
{:else}
	<form
		method="POST"
		action="?/reassign"
		class="reassign"
		use:enhance={() => {
			busy = true;
			return async ({ update, result }) => {
				await update();
				busy = false;
				if (result.type === 'success') open = false;
			};
		}}
	>
		<input type="hidden" name="kind" value={kind} />
		<input type="hidden" name="id" value={id} />
		<label for="to-{id}" class="label">Who was {title} from?</label>
		<div class="row">
			<select id="to-{id}" name="to" class="line-input select" bind:value={to} required>
				<option value="" disabled>Choose someone</option>
				{#if accounts.length}
					<optgroup label="On Wrappy">
						{#each accounts as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
					</optgroup>
				{/if}
				{#if contacts.length}
					<optgroup label="Not on Wrappy">
						{#each contacts as o (o.id)}<option value={o.id}>{o.name}</option>{/each}
					</optgroup>
				{/if}
				<option value="new">Someone else…</option>
			</select>
			{#if to === 'new'}
				<label for="new-{id}" class="sr-only">Their name</label>
				<!-- svelte-ignore a11y_autofocus -->
				<input id="new-{id}" name="newName" class="line-input" maxlength="80" placeholder="Their name" required autofocus />
			{/if}
		</div>
		<div class="actions">
			<button class="btn btn-dark" disabled={busy || !to}>Move</button>
			<button type="button" class="btn btn-text" onclick={() => ((open = false), (to = ''))}>Cancel</button>
		</div>
		{#if error}<p class="field-error" role="alert">{error}</p>{/if}
	</form>
{/if}

<style>
	.toggle {
		height: 32px;
		font-size: 13px;
		padding: 0 4px;
	}
	.reassign {
		flex-basis: 100%;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 0 12px 38px;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 16px;
	}
	.row > * {
		flex: 1 1 180px;
		min-width: 0;
	}
	.select {
		font-family: var(--font-write);
		font-size: 20px;
	}
	.row input {
		font-size: 20px;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}
	@media (max-width: 520px) {
		.reassign {
			padding-left: 0;
		}
	}
</style>
