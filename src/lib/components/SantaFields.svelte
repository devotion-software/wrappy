<script lang="ts">
	import { CURRENCIES } from '#lib/format';
	interface Props {
		values?: { name?: string; description?: string | null; priceLimit?: string | null; currency?: string; exchangeDate?: string | null };
	}
	let { values = {} }: Props = $props();
</script>

<div class="field">
	<label for="name">Name</label>
	<input id="name" name="name" class="line-input" required maxlength="120" placeholder="Family Secret Santa" value={values.name ?? ''} />
</div>
<div class="field">
	<label for="description">Guidelines <span class="opt">(optional)</span></label>
	<textarea id="description" name="description" class="line-input area" rows="2" maxlength="2000" placeholder="Keep it fun and small — something that made you think of them!"
		>{values.description ?? ''}</textarea
	>
</div>
<div class="row">
	<div class="field grow">
		<label for="priceLimit">Budget <span class="opt">(optional)</span></label>
		<input id="priceLimit" name="priceLimit" class="line-input" inputmode="decimal" placeholder="20" value={values.priceLimit ?? ''} />
	</div>
	<div class="field">
		<label for="currency">Currency</label>
		<select id="currency" name="currency" class="line-input select">
			{#each CURRENCIES as c (c)}<option value={c} selected={(values.currency ?? 'GBP') === c}>{c}</option>{/each}
		</select>
	</div>
</div>
<div class="field">
	<label for="exchangeDate">Gift swap date <span class="opt">(optional)</span></label>
	<input id="exchangeDate" name="exchangeDate" type="date" class="line-input date" value={values.exchangeDate ?? ''} />
</div>

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
	.row {
		display: flex;
		gap: 16px;
		align-items: flex-end;
	}
	.grow {
		flex: 1;
	}
	.select {
		font-family: var(--font-ui);
		font-size: 16px;
		min-width: 90px;
	}
	.date {
		font-family: var(--font-ui);
		font-size: 17px;
		max-width: 240px;
	}
</style>
