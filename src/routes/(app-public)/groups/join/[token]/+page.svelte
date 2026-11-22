<script lang="ts">
	import Sheet from '#lib/components/ui/Sheet.svelte';
	import Checkbox from '#lib/components/ui/Checkbox.svelte';
	import { plural, tiltFor } from '#lib/format';

	let { data, form } = $props();
</script>

<svelte:head><title>{data.group.name} — group invite</title></svelte:head>

<main class="container page">
	<div class="with-aside">
		<Sheet tape margin={50} padding="48px 40px 40px 76px" class="main-col sheet">
			<p class="from">{data.ownerName} invited you to</p>
			<h1 class="hand">{data.group.name}</h1>
			<p class="copy">
				A group on Wrappy. Everyone in it can share their wish lists with the whole group in one go, so birthdays and Christmas
				are easier to sort out.
			</p>
			<form method="POST" class="actions">
				<button class="btn btn-primary btn-lg">{data.user ? 'Join the group' : 'Log in to join'}</button>
				<a href={data.user ? '/friends' : '/'} class="decline">Not now</a>
			</form>
			{#if form?.joinError}<p class="field-error" role="alert">{form.joinError}</p>{/if}
		</Sheet>

		<aside>
			<Sheet margin={false} padding="24px">
				<div class="head">
					<h2 class="hand h2">Who's in it</h2>
					<span class="meta">{plural(data.members.length, 'person', 'people')}</span>
				</div>
				<div class="people">
					{#each data.members as m (m.id)}
						<div class="person"><Checkbox checked size={20} tilt={tiltFor(m.id)} /><span class="write">{m.name}</span></div>
					{/each}
				</div>
			</Sheet>
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
	.copy {
		margin: 16px 0 0;
		font-size: 16px;
		line-height: 1.5;
		color: var(--ink2);
		max-width: 520px;
	}
	.actions {
		margin-top: 28px;
		display: flex;
		align-items: center;
		gap: 20px;
		flex-wrap: wrap;
	}
	.decline {
		font-size: 15px;
		color: var(--ink2);
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}
	.h2 {
		margin: 0;
		font-size: 30px;
	}
	.people {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.person {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.person .write {
		font-size: 20px;
	}
	@media (max-width: 600px) {
		.page :global(.sheet) {
			padding: 32px 16px 24px 40px !important;
		}
		.page :global(.sheet > .margin) {
			left: 24px !important;
		}
	}
</style>
