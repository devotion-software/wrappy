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
