import { describe, expect, it } from 'vitest';
import { parseSantaForm } from './santaForm';

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('parseSantaForm', () => {
	it('parses a full form', () => {
		expect(
			parseSantaForm(fd({ name: ' Office ', description: ' Be nice ', priceLimit: '£20', currency: 'eur', exchangeDate: '2026-12-20' }))
		).toEqual({ input: { name: 'Office', description: 'Be nice', priceLimit: '20.00', currency: 'EUR', exchangeDate: '2026-12-20' } });
	});

	it('defaults optional fields', () => {
		expect(parseSantaForm(fd({ name: 'Family' }))).toEqual({
			input: { name: 'Family', description: null, priceLimit: null, currency: 'GBP', exchangeDate: null }
		});
	});

	it('requires a name of at most 120 characters', () => {
		expect(parseSantaForm(fd({ name: ' ' }))).toEqual({ error: 'Give your Secret Santa a name.' });
		expect(parseSantaForm(fd({ name: 'n'.repeat(121) }))).toEqual({ error: 'Keep the name under 120 characters.' });
		expect('input' in parseSantaForm(fd({ name: 'n'.repeat(120) }))).toBe(true);
	});

	it('limits guidelines to 2000 characters', () => {
		expect(parseSantaForm(fd({ name: 'X', description: 'd'.repeat(2001) }))).toEqual({
			error: 'Keep the guidelines under 2,000 characters.'
		});
	});

	it('rejects a budget that is not a number', () => {
		expect(parseSantaForm(fd({ name: 'X', priceLimit: 'twenty' }))).toEqual({ error: 'Enter the budget as a number, like 20.' });
	});

	it('normalises budgets written with separators', () => {
		const r = parseSantaForm(fd({ name: 'X', priceLimit: '1.234,5' }));
		expect('input' in r && r.input.priceLimit).toBe('1234.50');
	});

	it('falls back to GBP for unknown currencies', () => {
		const r = parseSantaForm(fd({ name: 'X', currency: 'XYZ' }));
		expect('input' in r && r.input.currency).toBe('GBP');
	});

	it('rejects malformed dates', () => {
		expect(parseSantaForm(fd({ name: 'X', exchangeDate: '20/12/2026' }))).toEqual({ error: 'Pick a valid date.' });
	});
});
