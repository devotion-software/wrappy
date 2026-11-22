<script lang="ts">
	import { confirmation } from '#lib/confirm.svelte';

	let dialog = $state<HTMLDialogElement>();
	const pending = $derived(confirmation.current);

	$effect(() => {
		if (!dialog) return;
		if (pending && !dialog.open) dialog.showModal();
		else if (!pending && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	class="confirm"
	aria-labelledby="confirm-message"
	oncancel={(e) => {
		e.preventDefault();
		pending?.answer(false);
	}}
	onclick={(e) => {
		// A tap on the backdrop (outside the box) counts as cancel.
		if (e.target === dialog) pending?.answer(false);
	}}
>
	{#if pending}
		<div class="box">
			<p id="confirm-message">{pending.message}</p>
			<div class="actions">
				<button type="button" class="btn btn-text" onclick={() => pending.answer(false)}>{pending.no}</button>
				<!-- svelte-ignore a11y_autofocus -->
				<button type="button" class="btn btn-dark" autofocus onclick={() => pending.answer(true)}>{pending.yes}</button>
			</div>
		</div>
	{/if}
</dialog>

<style>
	.confirm {
		padding: 0;
		border: none;
		border-radius: 8px;
		background: var(--paper);
		color: var(--ink);
		box-shadow: var(--shadow);
		width: min(420px, calc(100vw - 32px));
		max-width: none;
	}
	.confirm::backdrop {
		background: rgba(0, 0, 0, 0.45);
	}
	.box {
		padding: 24px 24px 18px;
	}
	p {
		margin: 0 0 20px;
		font-size: 16px;
		line-height: 1.5;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
