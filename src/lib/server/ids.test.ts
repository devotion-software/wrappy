import { describe, expect, it } from 'vitest';
import { newId, newToken, slugify } from './ids';

describe('newId', () => {
	it('is 22 URL-safe alphanumerics', () => {
		for (let i = 0; i < 50; i++) expect(newId()).toMatch(/^[0-9A-Za-z]{22}$/);
	});

	it('does not repeat', () => {
		const ids = new Set(Array.from({ length: 5000 }, () => newId()));
		expect(ids.size).toBe(5000);
	});
});

describe('newToken', () => {
	it('is 40 URL-safe alphanumerics', () => {
		for (let i = 0; i < 50; i++) expect(newToken()).toMatch(/^[0-9A-Za-z]{40}$/);
	});

	it('does not repeat', () => {
		expect(new Set(Array.from({ length: 2000 }, () => newToken())).size).toBe(2000);
	});
});

describe('slugify', () => {
	it('lowercases, hyphenates and adds a 5-char suffix', () => {
		expect(slugify('  Christmas 2026!  ')).toMatch(/^christmas-2026-[0-9a-z]{5}$/);
	});

	it('collapses whitespace and repeated dashes', () => {
		expect(slugify('a  b\tc--d')).toMatch(/^a-b-c-d-[0-9a-z]{5}$/);
	});

	it('drops punctuation, including underscores', () => {
		expect(slugify("Joe's_list!")).toMatch(/^joeslist-[0-9a-z]{5}$/);
	});

	it('trims leading and trailing dashes', () => {
		expect(slugify('--hello--')).toMatch(/^hello-[0-9a-z]{5}$/);
	});

	it('falls back to "project" when nothing usable is left', () => {
		expect(slugify('!!!')).toMatch(/^project-[0-9a-z]{5}$/);
		expect(slugify('')).toMatch(/^project-[0-9a-z]{5}$/);
	});

	it('caps the base at 40 characters', () => {
		const base = slugify('x'.repeat(100)).split('-')[0];
		expect(base).toHaveLength(40);
	});

	it('gives different suffixes each time', () => {
		expect(new Set(Array.from({ length: 50 }, () => slugify('same'))).size).toBeGreaterThan(45);
	});
});
