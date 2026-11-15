<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';

	/** Line input for noting a present that wasn't on a list. */
	interface Props {
		giverId: string;
		giverFirstName: string;
		error?: string | null;
		action?: string;
	}
	let { giverId, giverFirstName, error = null, action = '?/addGift' }: Props = $props();
	let busy = $state(false);
</script>

<form
	method="POST"
	{action}
	class="add-gift"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update();
			busy = false;
		};
	}}
>
	<input type="hidden" name="giverId" value={giverId} />
	<Icon name="plus" size={18} />
	<label for="gift-{giverId}" class="sr-only">Something else {giverFirstName} gave you</label>
	<input
		id="gift-{giverId}"
		name="title"
		class="line-input dashed"
		maxlength="200"
		autocomplete="off"
		placeholder="Something else {giverFirstName} gave you…"
		required
	/>
	<button class="btn btn-dark" disabled={busy}>Add</button>
</form>
{#if error}<p class="field-error" role="alert">{error}</p>{/if}

<style>
	.add-gift {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--ink2);
		margin-top: 4px;
	}
	.add-gift input[name='title'] {
		flex: 1;
		min-width: 0;
		height: 40px;
		font-size: 19px;
	}
</style>
