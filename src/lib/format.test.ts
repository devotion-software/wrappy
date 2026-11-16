import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENCIES, formatDate, formatPrice, plural, tiltFor, toCurrency } from './format';

describe('formatPrice', () => {
	it('drops pence for whole amounts and keeps two decimals otherwise', () => {
		expect(formatPrice('20', 'GBP')).toBe('£20');
		expect(formatPrice('20.00', 'GBP')).toBe('£20');
		expect(formatPrice('24.5', 'GBP')).toBe('£24.50');
		expect(formatPrice('24.99')).toBe('£24.99');
	});

	it('uses the given currency', () => {
		expect(formatPrice('10', 'EUR')).toBe('€10');
		expect(formatPrice('10', 'USD')).toBe('US$10');
		expect(formatPrice('1299.5', 'GBP')).toBe('£1,299.50');
	});

	it('falls back to "n.nn CODE" for a currency Intl rejects', () => {
		expect(formatPrice('5', 'NOPE!')).toBe('5.00 NOPE!');
	});

	it.each([null, undefined, '', 'abc', 'NaN', 'Infinity'])('returns null for %j', (v) => {
		expect(formatPrice(v as string | null | undefined, 'GBP')).toBeNull();
	});

	it('formats zero', () => expect(formatPrice('0', 'GBP')).toBe('£0'));
});

describe('formatDate', () => {
	afterEach(() => vi.useRealTimers());

	it('omits the year for dates in the current year', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
		expect(formatDate('2026-12-25')).toBe('25 Dec');
	});

	it('adds the year for other years', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
		expect(formatDate('2027-01-03')).toBe('3 Jan 2027');
		expect(formatDate('2025-12-25')).toBe('25 Dec 2025');
	});

	it('ignores any time part', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
		expect(formatDate('2026-03-04T23:59:59Z')).toBe('4 Mar');
	});

	it.each([null, undefined, '', 'not-a-date', '2026-13-45'])('returns null for %j', (v) => {
		expect(formatDate(v as string | null | undefined)).toBeNull();
	});
});

describe('toCurrency', () => {
	it('accepts supported codes in any case', () => {
		expect(toCurrency('eur')).toBe('EUR');
		expect(toCurrency('USD', 'GBP')).toBe('USD');
	});
	it('falls back for anything else, and to GBP when the fallback is no good either', () => {
		expect(toCurrency('XYZ', 'EUR')).toBe('EUR');
		expect(toCurrency(null, 'AUD')).toBe('AUD');
		expect(toCurrency(undefined)).toBe('GBP');
		expect(toCurrency('', null)).toBe('GBP');
		expect(toCurrency('nope', 'also-nope')).toBe('GBP');
	});
});

describe('plural', () => {
	it('uses singular only for exactly one', () => {
		expect(plural(1, 'wish')).toBe('1 wish');
		expect(plural(0, 'wish', 'wishes')).toBe('0 wishes');
		expect(plural(2, 'list')).toBe('2 lists');
		expect(plural(3, 'person', 'people')).toBe('3 people');
	});
});

describe('tiltFor', () => {
	it('is stable for the same id', () => {
		expect(tiltFor('abc')).toBe(tiltFor('abc'));
	});

	it('stays within −3° to +2.5° in half-degree steps', () => {
		for (let i = 0; i < 500; i++) {
			const t = tiltFor(`id-${i}-${Math.random()}`);
			expect(t).toBeGreaterThanOrEqual(-3);
			expect(t).toBeLessThanOrEqual(2.5);
			expect(Number.isInteger(t * 2)).toBe(true);
		}
	});

	it('handles the empty string', () => expect(tiltFor('')).toBe(-3));

	it('varies across ids', () => {
		const seen = new Set(Array.from({ length: 100 }, (_, i) => tiltFor(`item${i}`)));
		expect(seen.size).toBeGreaterThan(3);
	});
});

describe('CURRENCIES', () => {
	it('lists unique 3-letter codes, GBP first', () => {
		expect(CURRENCIES[0]).toBe('GBP');
		expect(new Set(CURRENCIES).size).toBe(CURRENCIES.length);
		for (const c of CURRENCIES) expect(c).toMatch(/^[A-Z]{3}$/);
	});

	it('are all formattable by Intl', () => {
		for (const c of CURRENCIES) expect(formatPrice('1.5', c)).not.toMatch(/1\.50 [A-Z]{3}$/);
	});
});
