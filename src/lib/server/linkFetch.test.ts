import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('./safeFetch', async (importActual) => ({ ...(await importActual<typeof import('./safeFetch')>()), safeFetch }));

import { fetchLinkMeta, looksLikeUrl, normaliseUrl, readShared } from './linkFetch';
import { FetchBlockedError } from './safeFetch';

const page = (html: string, contentType = 'text/html; charset=utf-8', url = 'https://shop.example.com/p') => ({
	url,
	contentType,
	body: new TextEncoder().encode(html)
});

describe('looksLikeUrl', () => {
	it.each([
		'https://example.com',
		'http://example.com/x?y=1',
		'HTTPS://EXAMPLE.COM',
		'example.com',
		'www.example.co.uk/path/to/thing',
		'shop.example.com/p/123?ref=abc',
		'  example.com  '
	])('treats %j as a link', (s) => expect(looksLikeUrl(s)).toBe(true));

	it.each(['A red scarf', 'scarf', 'size 10.5', 'https://example.com with words', 'e.g.', 'mailto:a@b.com', ''])(
		'treats %j as text',
		(s) => expect(looksLikeUrl(s)).toBe(false)
	);
});

describe('normaliseUrl', () => {
	it('adds https:// when missing', () => {
		expect(normaliseUrl('example.com/p')).toBe('https://example.com/p');
		expect(normaliseUrl('  www.example.com ')).toBe('https://www.example.com/');
	});

	it('keeps an explicit http scheme', () => {
		expect(normaliseUrl('http://example.com')).toBe('http://example.com/');
	});

	it.each(['ftp://example.com/file', 'FILE:///etc/passwd', 'http://127.0.0.1/', 'localhost:8080', 'http://user:pw@example.com/', '10.0.0.1/admin'])('rejects %j', (s) =>
		expect(() => normaliseUrl(s)).toThrow(FetchBlockedError)
	);
});

describe('readShared', () => {
	it('takes the url and title as given', () => {
		expect(readShared({ url: 'https://shop.example.com/a', title: ' Socks ' })).toEqual({ url: 'https://shop.example.com/a', title: 'Socks' });
	});
	it('finds a link inside shared text, trimming trailing punctuation', () => {
		expect(readShared({ text: 'Look at this! https://shop.example.com/a?b=1).' })).toEqual({ url: 'https://shop.example.com/a?b=1', title: null });
		expect(readShared({ text: 'shop.example.com/scarf' })).toEqual({ url: 'https://shop.example.com/scarf', title: null });
	});
	it('turns plain text with no link into the title', () => {
		expect(readShared({ text: '  Cosy\n socks ' })).toEqual({ url: null, title: 'Cosy socks' });
	});
	it('drops links that are not allowed and returns null for nothing at all', () => {
		expect(readShared({ url: 'javascript:alert(1)', title: 'x' })).toEqual({ url: null, title: 'x' });
		expect(readShared({ url: 'ftp://example.com/a' })).toBeNull();
		expect(readShared({})).toBeNull();
	});
	it('shortens very long titles', () => {
		expect(readShared({ title: 'a'.repeat(300) })!.title).toHaveLength(200);
	});
});

describe('fetchLinkMeta', () => {
	beforeEach(() => safeFetch.mockReset());

	it('parses product details from the final page URL', async () => {
		safeFetch.mockResolvedValue(
			page('<meta property="og:title" content="Scarf"><meta property="og:image" content="/a.jpg">', 'text/html', 'https://cdn.example.com/x')
		);
		const meta = await fetchLinkMeta('https://shop.example.com/p');
		expect(meta).toMatchObject({ title: 'Scarf', images: ['https://cdn.example.com/a.jpg'] });
		expect(safeFetch).toHaveBeenCalledWith('https://shop.example.com/p', expect.objectContaining({ maxBytes: 3 * 1024 * 1024 }));
	});

	it('accepts XHTML', async () => {
		safeFetch.mockResolvedValue(page('<title>Thing</title>', 'application/xhtml+xml'));
		expect(await fetchLinkMeta('https://x.example')).toMatchObject({ title: 'Thing' });
	});

	it('returns null for non-HTML responses', async () => {
		safeFetch.mockResolvedValue(page('{"title":"x"}', 'application/json'));
		expect(await fetchLinkMeta('https://x.example')).toBeNull();
	});

	it('returns null when the page has nothing useful', async () => {
		safeFetch.mockResolvedValue(page('<html><body>hello</body></html>'));
		expect(await fetchLinkMeta('https://x.example')).toBeNull();
	});

	it('keeps a page with only a price or only images', async () => {
		safeFetch.mockResolvedValue(page('<meta property="product:price:amount" content="9.99">'));
		expect(await fetchLinkMeta('https://x.example')).toMatchObject({ title: null, price: '9.99' });
		safeFetch.mockResolvedValue(page('<meta property="og:image" content="https://x.example/i.png">'));
		expect(await fetchLinkMeta('https://x.example')).toMatchObject({ images: ['https://x.example/i.png'] });
	});

	it.each(['Access Denied', 'Are you a robot?', 'Just a moment...', 'Attention Required! | Cloudflare', 'Please complete the CAPTCHA'])(
		'treats bot walls titled %j as failures',
		async (title) => {
			safeFetch.mockResolvedValue(page(`<title>${title}</title><meta property="og:image" content="https://x.example/i.png">`));
			expect(await fetchLinkMeta('https://x.example')).toBeNull();
		}
	);

	it('returns null when the fetch throws', async () => {
		safeFetch.mockImplementationOnce(async () => {
			throw new FetchBlockedError('Blocked');
		});
		expect(await fetchLinkMeta('https://x.example')).toBeNull();
		safeFetch.mockImplementationOnce(async () => {
			throw new Error('HTTP 500');
		});
		expect(await fetchLinkMeta('https://x.example')).toBeNull();
	});

	it('decodes invalid UTF-8 without throwing', async () => {
		safeFetch.mockResolvedValue({
			url: 'https://x.example',
			contentType: 'text/html',
			body: new Uint8Array([...new TextEncoder().encode('<title>Caf'), 0xff, ...new TextEncoder().encode('</title>')])
		});
		expect((await fetchLinkMeta('https://x.example'))?.title).toMatch(/^Caf/);
	});
});
