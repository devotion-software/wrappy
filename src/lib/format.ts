/** Shared display helpers (client + server). */

export function formatPrice(price: string | null | undefined, currency = 'GBP'): string | null {
	if (price === null || price === undefined || price === '') return null;
	const n = Number(price);
	if (!Number.isFinite(n)) return null;
	try {
		return new Intl.NumberFormat('en-GB', {
			style: 'currency',
			currency,
			minimumFractionDigits: n % 1 === 0 ? 0 : 2,
			maximumFractionDigits: 2
		}).format(n);
	} catch {
		return `${n.toFixed(2)} ${currency}`;
	}
}

/** "2026-12-25" → "25 Dec" (adds the year when it isn't this year). */
export function formatDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
	return d.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	});
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** Stable small tilt for a hand-drawn checkbox, derived from an id (−3° to +2.5°). */
export function tiltFor(id: string): number {
	let h = 0;
	for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
	return ((Math.abs(h) % 12) - 6) / 2;
}

export const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY', 'INR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = 'GBP';

/** A supported currency code (case-insensitive), or the fallback. */
export function toCurrency(value: unknown, fallback: string | null = DEFAULT_CURRENCY): Currency {
	const c = String(value ?? '').toUpperCase();
	if ((CURRENCIES as readonly string[]).includes(c)) return c as Currency;
	return fallback && (CURRENCIES as readonly string[]).includes(fallback) ? (fallback as Currency) : DEFAULT_CURRENCY;
}
