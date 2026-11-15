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
