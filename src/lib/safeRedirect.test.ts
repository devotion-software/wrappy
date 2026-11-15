import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safeRedirect';

describe('safeRedirect', () => {
	it.each([
		null,
		'',
		'https://evil.com',
		'//evil.com',
		'/\\evil.com',
		'/\t/evil.com',
		'/\n/evil.com',
		'/\r/evil.com',
		'\t//evil.com',
		'javascript:alert(1)',
		'lists'
	])('rejects %j', (t) => expect(safeRedirect(t)).toBe('/lists'));

	it.each(['/lists', '/lists/abc?x=1', '/santa/join/tok#top', '/%09/evil.com'])('keeps %j', (t) =>
		expect(new URL(safeRedirect(t), 'https://site.test').origin).toBe('https://site.test')
	);

	it('keeps path, query and hash', () => expect(safeRedirect('/lists/abc?x=1#y')).toBe('/lists/abc?x=1#y'));
});

describe('safeRedirect — more', () => {
	it('uses a custom fallback', () => {
		expect(safeRedirect('https://evil.com', '/home')).toBe('/home');
		expect(safeRedirect(undefined, '/x')).toBe('/x');
	});

	it.each(['/\u0000/evil.com', '/\u007f', '/a\\b', '///evil.com'])('rejects %j', (t) => expect(safeRedirect(t)).toBe('/lists'));

	it('normalises dot segments without leaving the site', () => {
		expect(safeRedirect('/a/../../b')).toBe('/b');
		expect(safeRedirect('/./lists')).toBe('/lists');
	});

	it('keeps percent-encoding as-is', () => {
		expect(safeRedirect('/lists?next=%2F%2Fevil.com')).toBe('/lists?next=%2F%2Fevil.com');
	});

	it('keeps the root path', () => expect(safeRedirect('/')).toBe('/'));
});
