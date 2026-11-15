import { CURRENCIES } from '#lib/format';
import { normalisePrice } from './linkMeta';

export function parseSantaForm(fd: FormData):
	| { error: string }
	| { input: { name: string; description: string | null; priceLimit: string | null; currency: string; exchangeDate: string | null } } {
	const name = String(fd.get('name') ?? '').trim();
	if (!name) return { error: 'Give your Secret Santa a name.' };
	if (name.length > 120) return { error: 'Keep the name under 120 characters.' };
	const description = String(fd.get('description') ?? '').trim() || null;
	if (description && description.length > 2000) return { error: 'Keep the guidelines under 2,000 characters.' };
	const rawLimit = String(fd.get('priceLimit') ?? '').trim();
	const priceLimit = rawLimit ? normalisePrice(rawLimit) : null;
	if (rawLimit && !priceLimit) return { error: 'Enter the budget as a number, like 20.' };
	const cur = String(fd.get('currency') ?? 'GBP').toUpperCase();
	const currency = (CURRENCIES as readonly string[]).includes(cur) ? cur : 'GBP';
	const exchangeDate = String(fd.get('exchangeDate') ?? '').trim() || null;
	if (exchangeDate && !/^\d{4}-\d{2}-\d{2}$/.test(exchangeDate)) return { error: 'Pick a valid date.' };
	return { input: { name, description, priceLimit, currency, exchangeDate } };
}
