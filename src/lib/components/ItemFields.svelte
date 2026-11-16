<script lang="ts">
	import { page } from '$app/state';
	import { CURRENCIES, DEFAULT_CURRENCY } from '#lib/format';

	interface Props {
		values?: { title?: string; notes?: string | null; price?: string | null; currency?: string; mostWanted?: boolean };
		priceRequired?: boolean;
	}
	let { values = {}, priceRequired = false }: Props = $props();
	// New ones start in the currency set on the account page.
	const fallbackCurrency = $derived(page.data.user?.currency ?? DEFAULT_CURRENCY);
</script>

<div class="field">
	<label for="title">Item</label>
	<input id="title" name="title" class="line-input" required maxlength="200" placeholder="Wool scarf, charcoal" value={values.title ?? ''} />
</div>
<div class="field">
	<label for="notes">Notes <span class="opt">(optional)</span></label>
	<textarea id="notes" name="notes" class="line-input area" rows="2" maxlength="2000" placeholder="Size, colour, anything that helps"
		>{values.notes ?? ''}</textarea
	>
</div>
<div class="price-row">
	<div class="field grow">
		<label for="price">Price {#if !priceRequired}<span class="opt">(optional)</span>{/if}</label>
		<input
			id="price"
			name="price"
			class="line-input"
			inputmode="decimal"
			placeholder="24.99"
			required={priceRequired}
			value={values.price ?? ''}
		/>
	</div>
	<div class="field">
		<label for="currency">Currency</label>
		<select id="currency" name="currency" class="line-input select">
			{#each CURRENCIES as c (c)}<option value={c} selected={(values.currency ?? fallbackCurrency) === c}>{c}</option>{/each}
		</select>
	</div>
</div>
<label class="star-row">
	<input type="checkbox" name="mostWanted" checked={values.mostWanted ?? false} />
	<span>Most wanted</span>
	<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold)" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"
		><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg
	>
</label>

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
	.price-row {
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
	.star-row {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		font-size: 15px;
		cursor: pointer;
	}
	.star-row input {
		width: 18px;
		height: 18px;
		margin: 0;
		accent-color: var(--gold);
	}
</style>
