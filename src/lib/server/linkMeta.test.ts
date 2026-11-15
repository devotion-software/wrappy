import { describe, expect, it } from 'vitest';
import { normalisePrice, parseLinkMeta } from './linkMeta';

const url = 'https://shop.example.com/p/scarf';

describe('parseLinkMeta', () => {
	it('prefers JSON-LD Product data', () => {
		const html = `<html><head>
			<title>Ignore me</title>
			<meta property="og:title" content="OG title">
			<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Wool scarf &amp; hat","description":"Charcoal grey","image":["/img/1.jpg",{"url":"https://cdn.example.com/2.jpg"}],"offers":{"@type":"Offer","price":"24.99","priceCurrency":"gbp"}}]}</script>
		</head></html>`;
		expect(parseLinkMeta(html, url)).toEqual({
			title: 'Wool scarf & hat',
			description: 'Charcoal grey',
			price: '24.99',
			currency: 'GBP',
			images: ['https://shop.example.com/img/1.jpg', 'https://cdn.example.com/2.jpg']
		});
	});

	it('falls back to OpenGraph and product meta tags', () => {
		const html = `<head>
			<meta property="og:title" content="Film camera">
			<meta property="og:description" content="35mm point-and-shoot">
			<meta property="og:image" content="https://shop.example.com/a.jpg">
			<meta property="og:image" content="https://shop.example.com/b.jpg">
			<meta property="product:price:amount" content="1.299,00">
			<meta property="product:price:currency" content="EUR">
		</head>`;
		const m = parseLinkMeta(html, url);
		expect(m.title).toBe('Film camera');
		expect(m.price).toBe('1299.00');
		expect(m.currency).toBe('EUR');
		expect(m.images).toHaveLength(2);
	});

	it('uses <title> when nothing else exists and ignores non-http images', () => {
		const html = `<title> Plain page </title><meta property="og:image" content="javascript:alert(1)">`;
		const m = parseLinkMeta(html, url);
		expect(m.title).toBe('Plain page');
		expect(m.images).toEqual([]);
		expect(m.price).toBeNull();
	});

	it('survives broken JSON-LD', () => {
		const html = `<script type="application/ld+json">{oops</script><meta name="twitter:title" content="T">`;
		expect(parseLinkMeta(html, url).title).toBe('T');
	});
});

describe('normalisePrice', () => {
	it.each([
		['£24.99', '24.99'],
		['1,234.50', '1234.50'],
		['12,50', '12.50'],
		[19, '19.00'],
		['free', null],
		['', null]
	])('%s → %s', (input, out) => {
		expect(normalisePrice(input)).toBe(out);
	});
});

describe('parseLinkMeta — more sources', () => {
	it('finds a Product in mainEntity, typed arrays and ProductGroup', () => {
		const ld = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
		expect(parseLinkMeta(ld({ '@type': 'WebPage', mainEntity: { '@type': 'Product', name: 'A' } }), url).title).toBe('A');
		expect(parseLinkMeta(ld({ '@type': ['Thing', 'Product'], name: 'B' }), url).title).toBe('B');
		expect(parseLinkMeta(ld([{ '@type': 'Organization' }, { '@type': 'ProductGroup', name: 'C' }]), url).title).toBe('C');
	});

	it('skips a broken JSON-LD block and uses a later one', () => {
		const html = `<script type="application/ld+json">{bad</script><script type="application/ld+json">{"@type":"Product","name":"Later"}</script>`;
		expect(parseLinkMeta(html, url).title).toBe('Later');
	});

	it('reads lowPrice, offer arrays, nested AggregateOffer and priceSpecification', () => {
		const ld = (offers: unknown) =>
			parseLinkMeta(`<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'X', offers })}</script>`, url);
		expect(ld([{ price: 5, priceCurrency: 'usd' }, { price: 9 }])).toMatchObject({ price: '5.00', currency: 'USD' });
		expect(ld({ '@type': 'AggregateOffer', lowPrice: '7.5', priceCurrency: 'EUR' })).toMatchObject({ price: '7.50', currency: 'EUR' });
		expect(ld({ offers: [{ price: '3' }] })).toMatchObject({ price: '3.00' });
		expect(ld({ priceSpecification: { price: '11', priceCurrency: 'GBP' } })).toMatchObject({ price: '11.00', currency: 'GBP' });
	});

	it('ignores invalid currency codes', () => {
		const html = `<meta property="product:price:amount" content="5"><meta property="product:price:currency" content="pounds">`;
		expect(parseLinkMeta(html, url)).toMatchObject({ price: '5.00', currency: null });
	});

	it('uses meta description and twitter fallbacks', () => {
		const html = `<meta name="description" content="Plain desc"><meta name="twitter:image" content="//cdn.example.com/t.jpg">`;
		expect(parseLinkMeta(html, url)).toMatchObject({ description: 'Plain desc', images: ['https://cdn.example.com/t.jpg'] });
	});

	it('collects images from every source, de-duplicated and capped at 12', () => {
		const tags = Array.from({ length: 20 }, (_, i) => `<meta property="og:image" content="/i${i}.jpg">`).join('');
		const html = `<meta property="og:image" content="/i0.jpg"><link rel="image_src" href="/link.jpg">${tags}`;
		const { images } = parseLinkMeta(html, url);
		expect(images).toHaveLength(12);
		expect(new Set(images).size).toBe(12);
		expect(images[0]).toBe('https://shop.example.com/i0.jpg');
	});

	it('reads image_src links and JSON-LD image objects with contentUrl', () => {
		const html = `<script type="application/ld+json">{"@type":"Product","name":"X","image":{"contentUrl":"/c.jpg"}}</script><link rel="image_src" href="/l.jpg">`;
		expect(parseLinkMeta(html, url).images).toEqual(['https://shop.example.com/c.jpg', 'https://shop.example.com/l.jpg']);
	});

	it('decodes HTML entities in titles and image URLs', () => {
		const html = `<meta property="og:title" content="Caf&#233; &quot;Noir&quot; &#x2014; &apos;mug&apos; &lt;3"><meta property="og:image" content="/a.jpg?x=1&amp;y=2">`;
		const m = parseLinkMeta(html, url);
		expect(m.title).toBe(`Café "Noir" — 'mug' <3`);
		expect(m.images).toEqual(['https://shop.example.com/a.jpg?x=1&y=2']);
	});

	it('collapses whitespace and clips long titles and descriptions', () => {
		const html = `<meta property="og:title" content="${'a '.repeat(150)}"><meta property="og:description" content="${'d'.repeat(2500)}">`;
		const m = parseLinkMeta(html, url);
		expect(m.title!.length).toBe(200);
		expect(m.title!.endsWith('…')).toBe(true);
		expect(m.title).not.toMatch(/\s{2}/);
		expect(m.description!.length).toBe(2000);
	});

	it('returns empty results for an empty page', () => {
		expect(parseLinkMeta('', url)).toEqual({ title: null, description: null, price: null, currency: null, images: [] });
	});

	it('drops data: and other non-web image URLs', () => {
		const html = `<meta property="og:image" content="data:image/png;base64,AAA"><meta property="og:image" content="ftp://x.example/a.png">`;
		expect(parseLinkMeta(html, url).images).toEqual([]);
	});
});

describe('normalisePrice — more', () => {
	it.each([
		['1.234,56', '1234.56'],
		['€ 1 234,50', '1234.50'],
		['USD 99', '99.00'],
		[0, '0.00'],
		['0.5', '0.50'],
		[null, null],
		[undefined, null],
		['-5', '5.00'],
		['100000000', null],
		['99999999.99', '99999999.99'],
		['...', null]
	])('%j → %j', (input, out) => {
		expect(normalisePrice(input)).toBe(out);
	});
});
