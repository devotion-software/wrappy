import { describe, expect, it } from 'vitest';
import { parsePastedList } from './pasteList';

const titles = (text: string) => parsePastedList(text).map((w) => w.title);

describe('parsePastedList', () => {
	it('splits plain lines', () => {
		expect(titles('Socks\n\nA good book\r\nLego')).toEqual(['Socks', 'A good book', 'Lego']);
	});

	it('strips bullets, numbers and checkboxes', () => {
		const text = ['- Socks', '* Book', '• Mug', '1. Scarf', '2) Hat', '(3) Gloves', '- [ ] Lamp', '- [x] Pen', '-[ ] Kite', '[ ] Ball', '☐ Tea'].join('\n');
		expect(titles(text)).toEqual(['Socks', 'Book', 'Mug', 'Scarf', 'Hat', 'Gloves', 'Lamp', 'Pen', 'Kite', 'Ball', 'Tea']);
	});

	it('keeps hyphens and numbers that are part of the name', () => {
		expect(titles('T-shirt\n3 pairs of socks\n1.5m HDMI cable\nLego - Star Wars set')).toEqual([
			'T-shirt',
			'3 pairs of socks',
			'1.5m HDMI cable',
			'Lego - Star Wars set'
		]);
	});

	it('splits a list flattened onto one line', () => {
		expect(titles('- Socks - Book - Mug')).toEqual(['Socks', 'Book', 'Mug']);
		expect(titles('1. Socks 2. Book 3. Mug')).toEqual(['Socks', 'Book', 'Mug']);
		expect(titles('- [ ] Socks - [x] Book - [ ] Mug')).toEqual(['Socks', 'Book', 'Mug']);
	});

	it('does not split a single ordinary line', () => {
		expect(titles('Lego - Star Wars set')).toEqual(['Lego - Star Wars set']);
	});

	it('skips headings, rules and duplicates', () => {
		expect(titles('# Christmas\n- Socks\n---\n- socks\n- Book')).toEqual(['Socks', 'Book']);
	});

	it('pulls out links', () => {
		const [a, b, c] = parsePastedList(
			'- Red scarf https://shop.example.com/scarf\n- https://www.example.org/p/1\n- [Nice mug](https://mugs.example.com/m)'
		);
		expect(a).toMatchObject({ title: 'Red scarf', url: 'https://shop.example.com/scarf' });
		expect(b).toMatchObject({ title: 'example.org', url: 'https://www.example.org/p/1' });
		expect(c).toMatchObject({ title: 'Nice mug', url: 'https://mugs.example.com/m' });
	});

	it('pulls out prices with a currency', () => {
		const [a, b, c, d] = parsePastedList('Scarf - £12.50\nBoots (€80)\nHeadphones 1,299 USD\nBook 12');
		expect(a).toMatchObject({ title: 'Scarf', price: '12.50', currency: 'GBP' });
		expect(b).toMatchObject({ title: 'Boots', price: '80.00', currency: 'EUR' });
		expect(c).toMatchObject({ title: 'Headphones', price: '1299.00', currency: 'USD' });
		expect(d).toMatchObject({ title: 'Book 12', price: null });
	});

	it('shortens very long names', () => {
		const [w] = parsePastedList('x'.repeat(300));
		expect(w.title.length).toBe(200);
	});
});
