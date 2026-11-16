import { describe, expect, it } from 'vitest';
import { parseItemForm } from './items';

const fd = (fields: Record<string, string>) => {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
};

describe('parseItemForm', () => {
	it('parses a full form', () => {
		expect(parseItemForm(fd({ title: ' Scarf ', notes: ' grey ', price: '£24.99', currency: 'usd', mostWanted: 'on' }))).toEqual({
			input: { title: 'Scarf', notes: 'grey', price: '24.99', currency: 'USD', mostWanted: true, quantity: 1 }
		});
	});

	it('defaults optional fields', () => {
		expect(parseItemForm(fd({ title: 'Book' }))).toEqual({
			input: { title: 'Book', notes: null, price: null, currency: 'GBP', mostWanted: false, quantity: 1 }
		});
	});

	it('reads how many are wanted, or any number', () => {
		const q = (f: Record<string, string>) => {
			const r = parseItemForm(fd({ title: 'X', ...f }));
			return 'input' in r ? r.input.quantity : r.error;
		};
		expect(q({ quantity: '3' })).toBe(3);
		expect(q({ quantity: ' ' })).toBe(1);
		expect(q({ quantity: '3', anyQuantity: 'on' })).toBeNull();
		for (const bad of ['0', '100', '2.5', 'lots']) expect(q({ quantity: bad })).toBe("Enter how many you'd like, from 1 to 99.");
	});

	it('only treats the checkbox value "on" as most wanted', () => {
		const r = parseItemForm(fd({ title: 'X', mostWanted: 'true' }));
		expect('input' in r && r.input.mostWanted).toBe(false);
	});

	it('requires a title of at most 200 characters', () => {
		expect(parseItemForm(fd({ title: '  ' }))).toEqual({ error: 'Give the item a name.' });
		expect(parseItemForm(fd({ title: 't'.repeat(201) }))).toEqual({ error: 'Keep the name under 200 characters.' });
		expect('input' in parseItemForm(fd({ title: 't'.repeat(200) }))).toBe(true);
	});

	it('limits notes to 2000 characters', () => {
		expect(parseItemForm(fd({ title: 'X', notes: 'n'.repeat(2001) }))).toEqual({ error: 'Keep notes under 2,000 characters.' });
	});

	it('rejects prices that are not numbers', () => {
		expect(parseItemForm(fd({ title: 'X', price: 'cheap' }))).toEqual({ error: 'Enter the price as a number, like 24.99.' });
	});

	it('normalises European prices', () => {
		const r = parseItemForm(fd({ title: 'X', price: '12,50' }));
		expect('input' in r && r.input.price).toBe('12.50');
	});

	it('falls back to GBP for unsupported currencies', () => {
		const r = parseItemForm(fd({ title: 'X', currency: 'BTC' }));
		expect('input' in r && r.input.currency).toBe('GBP');
	});
});
