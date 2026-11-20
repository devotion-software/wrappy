<script lang="ts">
	interface Props {
		values?: { title?: string; description?: string | null; eventDate?: string | null; visibility?: string };
		hasUsername?: boolean;
		/** The list has occasions, which set its date instead. */
		datesFromOccasions?: boolean;
	}
	let { values = {}, hasUsername = true, datesFromOccasions = false }: Props = $props();
</script>

<div class="field">
	<label for="title">List name</label>
	<input id="title" name="title" class="line-input" required maxlength="120" placeholder="Christmas 2026" value={values.title ?? ''} />
</div>
<div class="field">
	<label for="description">Note for friends <span class="opt">(optional)</span></label>
	<textarea id="description" name="description" class="line-input area" maxlength="2000" rows="2" placeholder="Sizes, colours, anything that helps">{values.description ?? ''}</textarea>
</div>
{#if !datesFromOccasions}
	<div class="field">
		<label for="eventDate">Event date <span class="opt">(optional)</span></label>
		<input id="eventDate" name="eventDate" type="date" class="line-input date" value={values.eventDate ?? ''} />
	</div>
{/if}
<fieldset class="field vis">
	<legend class="label">Who can see it</legend>
	<label class="radio">
		<input type="radio" name="visibility" value="private" checked={(values.visibility ?? 'private') === 'private'} />
		<span><strong>Only people I share it with</strong><br /><span class="meta">Invite by email or send a secret link.</span></span>
	</label>
	<label class="radio">
		<input type="radio" name="visibility" value="public" checked={values.visibility === 'public'} />
		<span
			><strong>Public</strong><br /><span class="meta"
				>Shown on your profile{hasUsername ? '' : ' (choose a username in account settings)'} — anyone can find it.</span
			></span
		>
	</label>
</fieldset>

<style>
	.opt {
		font-weight: 400;
		color: var(--muted);
	}
	.area {
		height: auto;
		min-height: 44px;
		padding-top: 8px;
		resize: vertical;
		font-size: 20px;
		line-height: 1.4;
	}
	.date {
		font-family: var(--font-ui);
		font-size: 17px;
		max-width: 240px;
	}
	.vis {
		border: 0;
		padding: 0;
		margin: 0;
		gap: 10px;
	}
	.vis legend {
		margin-bottom: 8px;
	}
	.radio {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-height: 44px;
		font-size: 15px;
		line-height: 1.4;
		cursor: pointer;
	}
	.radio input {
		width: 18px;
		height: 18px;
		margin: 2px 0 0;
		accent-color: var(--gold);
		flex: none;
	}
</style>
