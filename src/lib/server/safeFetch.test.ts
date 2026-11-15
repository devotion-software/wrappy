import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('undici', async (importActual) => ({ ...(await importActual<typeof import('undici')>()), fetch: fetchMock }));

import { FetchBlockedError, safeFetch, validateUrl } from './safeFetch';

const opts = { accept: 'text/html', maxBytes: 100 };

function res(status: number, body: BodyInit | null = null, headers: Record<string, string> = {}) {
	return new Response(body, { status, headers });
}

/** A body that streams `chunks` without a content-length. */
function streamed(chunks: Uint8Array[]) {
	return new ReadableStream<Uint8Array>({
		start(c) {
			for (const ch of chunks) c.enqueue(ch);
			c.close();
		}
	});
}

describe('safeFetch', () => {
	beforeEach(() => fetchMock.mockReset());

	it('returns the body, content type and final URL', async () => {
		fetchMock.mockResolvedValue(res(200, 'hello', { 'content-type': 'text/html' }));
		const r = await safeFetch('https://example.com/a', opts);
		expect(r).toEqual({ url: 'https://example.com/a', contentType: 'text/html', body: new TextEncoder().encode('hello') });
		const [url, init] = fetchMock.mock.calls[0];
		expect(String(url)).toBe('https://example.com/a');
		expect(init).toMatchObject({ redirect: 'manual', headers: expect.objectContaining({ accept: 'text/html' }) });
		expect(init.headers['user-agent']).toMatch(/WishlistBot/);
		expect(init.dispatcher).toBeDefined();
	});

	it('defaults a missing content type to an empty string', async () => {
		fetchMock.mockResolvedValue(res(200, new Uint8Array([1, 2])));
		const r = await safeFetch('https://example.com/', opts);
		expect(r.contentType).toBe('');
		expect(r.body).toEqual(new Uint8Array([1, 2]));
	});

	it('rejects blocked URLs before fetching', async () => {
		await expect(safeFetch('http://127.0.0.1/', opts)).rejects.toThrow(FetchBlockedError);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('follows relative and absolute redirects', async () => {
		fetchMock
			.mockResolvedValueOnce(res(301, null, { location: '/b' }))
			.mockResolvedValueOnce(res(302, null, { location: 'https://other.example.com/c' }))
			.mockResolvedValueOnce(res(200, 'ok', { 'content-type': 'text/plain' }));
		const r = await safeFetch('https://example.com/a', opts);
		expect(r.url).toBe('https://other.example.com/c');
		expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
			'https://example.com/a',
			'https://example.com/b',
			'https://other.example.com/c'
		]);
	});

	it.each(['http://127.0.0.1/admin', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://example.com:8080/'])(
		'blocks a redirect to %s',
		async (location) => {
			fetchMock.mockResolvedValueOnce(res(302, null, { location }));
			await expect(safeFetch('https://example.com/', opts)).rejects.toThrow(FetchBlockedError);
			expect(fetchMock).toHaveBeenCalledTimes(1);
		}
	);

	it('rejects a redirect without a location', async () => {
		fetchMock.mockResolvedValueOnce(res(302));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('Redirect without location');
	});

	it('gives up after four redirects', async () => {
		fetchMock.mockImplementation(async () => res(302, null, { location: '/again' }));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('Too many redirects');
		expect(fetchMock).toHaveBeenCalledTimes(5);
	});

	it('allows exactly four redirects', async () => {
		for (let i = 0; i < 4; i++) fetchMock.mockResolvedValueOnce(res(302, null, { location: `/${i}` }));
		fetchMock.mockResolvedValueOnce(res(200, 'done'));
		await expect(safeFetch('https://example.com/', opts)).resolves.toMatchObject({ url: 'https://example.com/3' });
	});

	it('throws on error statuses', async () => {
		fetchMock.mockResolvedValue(res(404, 'nope'));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('HTTP 404');
		fetchMock.mockResolvedValue(res(500));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('HTTP 500');
	});

	it('rejects a declared content-length over the cap', async () => {
		fetchMock.mockResolvedValue(res(200, 'x', { 'content-length': '101' }));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('Response too large');
	});

	it('rejects a streamed body that grows over the cap', async () => {
		fetchMock.mockResolvedValue(res(200, streamed([new Uint8Array(60), new Uint8Array(60)])));
		await expect(safeFetch('https://example.com/', opts)).rejects.toThrow('Response too large');
	});

	it('accepts a body exactly at the cap and joins chunks in order', async () => {
		fetchMock.mockResolvedValue(res(200, streamed([new Uint8Array(50).fill(1), new Uint8Array(50).fill(2)])));
		const r = await safeFetch('https://example.com/', opts);
		expect(r.body).toHaveLength(100);
		expect(r.body[0]).toBe(1);
		expect(r.body[99]).toBe(2);
	});

	it('passes a timeout signal', async () => {
		fetchMock.mockResolvedValue(res(200, ''));
		await safeFetch('https://example.com/', { ...opts, timeoutMs: 50 });
		expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
	});
});

describe('validateUrl', () => {
	// Node skips DNS lookup for IP-literal hosts, so these must be caught before connecting.
	it.each([
		'http://127.0.0.1/',
		'http://169.254.169.254/latest/meta-data/',
		'http://10.0.0.5/',
		'http://2130706433/',
		'http://0x7f.1/',
		'http://[::1]/',
		'http://[::ffff:127.0.0.1]/',
		'https://[fd00::1]/',
		'ftp://example.com/',
		'http://example.com:8080/',
		'http://user:pass@example.com/'
	])('blocks %s', (url) => expect(() => validateUrl(url)).toThrow(FetchBlockedError));

	it.each(['https://example.com/product', 'http://93.184.216.34/', 'https://[2606:4700:4700::1111]/'])('allows %s', (url) =>
		expect(() => validateUrl(url)).not.toThrow()
	);
});

describe('validateUrl — more cases', () => {
	it('trims whitespace and returns a parsed URL', () => {
		const u = validateUrl('  https://example.com/a?b=1  ');
		expect(u).toBeInstanceOf(URL);
		expect(u.toString()).toBe('https://example.com/a?b=1');
	});

	it.each(['http://example.com:80/', 'https://example.com:443/'])('allows default port %s', (url) =>
		expect(() => validateUrl(url)).not.toThrow()
	);

	it.each([
		['not a url', 'Not a valid URL'],
		['', 'Not a valid URL'],
		['javascript:alert(1)', 'Only web links are supported'],
		['data:text/html,hi', 'Only web links are supported'],
		['https://example.com:8443/', 'Unsupported port'],
		['https://user@example.com/', 'Links with credentials are not supported'],
		['http://0.0.0.0/', 'Blocked address'],
		['http://192.168.0.1/', 'Blocked address'],
		['http://[fe80::1]/', 'Blocked address'],
		['http://017700000001/', 'Blocked address']
	])('rejects %j with "%s"', (url, message) => expect(() => validateUrl(url)).toThrow(message));

	it('allows hostnames (DNS is checked at connect time instead)', () => {
		expect(() => validateUrl('http://localhost/')).not.toThrow();
	});
});
