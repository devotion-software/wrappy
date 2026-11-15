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

describe('parsePastedList — more formats', () => {
	it('returns nothing for empty or whitespace-only input', () => {
		expect(parsePastedList('')).toEqual([]);
		expect(parsePastedList('  \n\t\n  ')).toEqual([]);
	});

	it('gives null url/price/currency for a plain wish', () => {
		expect(parsePastedList('Socks')).toEqual([{ title: 'Socks', url: null, price: null, currency: null }]);
	});

	it('strips quote markers and other bullet characters', () => {
		expect(titles('> Socks\n+ Book\n▪ Mug\n– Scarf\n✅ Hat\n[x] Gloves')).toEqual(['Socks', 'Book', 'Mug', 'Scarf', 'Hat', 'Gloves']);
	});

	it('skips markdown headings of every level and other horizontal rules', () => {
		expect(titles('## Big\n###### Small\n***\n___\n===\nSocks')).toEqual(['Socks']);
	});

	it('keeps a hash that is not a heading', () => {
		expect(titles('#1 dad mug')).toEqual(['#1 dad mug']);
	});

	it('removes markdown bold inside a line', () => {
		expect(titles('- A **Lego** set\n- Big __book__')).toEqual(['A Lego set', 'Big book']);
	});

	it('removes markdown bold at the start of a line', () => {
		expect(titles('- **Lego** set\n- __Big__ book\n**Kite** with tail')).toEqual(['Lego set', 'Big book', 'Kite with tail']);
	});

	it('trims trailing punctuation from bare links and adds https to www links', () => {
		const [a, b] = parsePastedList('Mug www.mugs.example.com/m1.\nCup (https://cups.example.com/c),');
		expect(a).toMatchObject({ title: 'Mug', url: 'https://www.mugs.example.com/m1' });
		expect(b.url).toBe('https://cups.example.com/c');
	});

	it('only takes the first link on a line', () => {
		const [w] = parsePastedList('Shoes https://a.example.com/1 https://b.example.com/2');
		expect(w.url).toBe('https://a.example.com/1');
	});

	it.each([
		['Book $15', '15.00', 'USD'],
		['Book ¥3000', '3000.00', 'JPY'],
		['Book ₹499', '499.00', 'INR'],
		['Book GBP 12', '12.00', 'GBP'],
		['Book 20 EUR', '20.00', 'EUR'],
		['Book 20eur', '20.00', 'EUR'],
		['Book 9.5 €', '9.50', 'EUR'],
		['Book CAD 1,000.25', '1000.25', 'CAD']
	])('reads the price in %j', (line, price, currency) => {
		expect(parsePastedList(line)[0]).toMatchObject({ title: 'Book', price, currency });
	});

	it('ignores numbers without a currency and absurd amounts', () => {
		expect(parsePastedList('iPhone 15')[0]).toMatchObject({ title: 'iPhone 15', price: null });
		expect(parsePastedList('Yacht £999999999')[0].price).toBeNull();
	});

	it('handles Windows line endings and blank lines between items', () => {
		expect(titles('- Socks\r\n\r\n- Book\r\n')).toEqual(['Socks', 'Book']);
	});

	it('falls back to the link host when only a link remains', () => {
		expect(parsePastedList('- https://www.shop.example.com/x')[0]).toMatchObject({ title: 'shop.example.com' });
	});

	it('drops lines that are only bullets or checkboxes', () => {
		expect(titles('-\n- [ ]\n☐\nSocks')).toEqual(['Socks']);
	});

	it('drops empty numbered lines', () => {
		expect(titles('1.\n2)\n(3)\nSocks')).toEqual(['Socks']);
	});

	it('splits a flattened bracket checklist', () => {
		expect(titles('[ ] Socks [x] Book [ ] Mug')).toEqual(['Socks', 'Book', 'Mug']);
	});

	it('treats duplicates case-insensitively and keeps the first', () => {
		const out = parsePastedList('Socks £5\nSOCKS £9');
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({ title: 'Socks', price: '5.00' });
	});

	it('shortens long names with an ellipsis', () => {
		const [w] = parsePastedList('word '.repeat(80));
		expect(w.title.endsWith('…')).toBe(true);
		expect(w.title.length).toBeLessThanOrEqual(200);
	});

	it('exports a sensible cap', async () => {
		const { MAX_PASTED_WISHES } = await import('./pasteList');
		expect(MAX_PASTED_WISHES).toBe(100);
	});
});
