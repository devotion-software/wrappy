<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '#lib/components/ui/Icon.svelte';

	/** Tick/untick "thanked" for one giver (an account or a contact). Posts to the page's ?/thanked action. */
	interface Props {
		personId: string;
		name: string;
		thanked: boolean;
	}
	let { personId, name, thanked }: Props = $props();
</script>

<form method="POST" action="?/thanked" use:enhance class="thanks">
	<input type="hidden" name="personId" value={personId} />
	<input type="hidden" name="on" value={thanked ? '0' : '1'} />
	<button
		class="btn {thanked ? 'btn-text done' : 'btn-outline'}"
		aria-pressed={thanked}
		aria-label={thanked ? `Thanked ${name} (click to undo)` : `Mark ${name} as thanked`}
	>
		{#if thanked}<Icon name="tick" size={16} strokeWidth={2.5} />Thanked{:else}Mark thanked{/if}
	</button>
</form>

<style>
	.thanks {
		margin: 0;
		flex: none;
	}
	.done {
		gap: 6px;
		color: var(--ink2);
	}
</style>
