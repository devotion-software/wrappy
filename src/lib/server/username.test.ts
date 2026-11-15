import { describe, expect, it } from 'vitest';
import { suggestUsername, usernameProblem } from './username';

describe('usernameProblem', () => {
	it.each(['sam', 'sam.smith', 'sam-smith', 'sam_smith', 'a1b', '123', 'x'.repeat(30)])('accepts %j', (u) => {
		expect(usernameProblem(u)).toBeNull();
	});

	it.each(['ab', '', 'x'.repeat(31)])('rejects length of %j', (u) => {
		expect(usernameProblem(u)).toBe('Usernames are 3 to 30 characters.');
	});

	it.each(['Sam', 'sam smith', '.sam', 'sam.', '-sam', 'sam_', 'sä m', 'sam@x', 'sam!'])('rejects characters in %j', (u) => {
		expect(usernameProblem(u)).toBe('Use lowercase letters, numbers, dots, dashes or underscores.');
	});

	it.each(['admin', 'lists', 'santa', 'signin', 'welcome', 'wishlist', 'api'])('reserves %j', (u) => {
		expect(usernameProblem(u)).toBe('That username is taken.');
	});
});

describe('suggestUsername', () => {
	it('joins words with dots', () => {
		expect(suggestUsername('Sam Smith')).toBe('sam.smith');
		expect(suggestUsername("Mary-Jane O'Neil")).toBe('mary.jane.o.neil');
	});

	it('strips accents', () => {
		expect(suggestUsername('Zoë Böhm')).toBe('zoe.bohm');
		expect(suggestUsername('José Núñez')).toBe('jose.nunez');
	});

	it('trims leading and trailing separators', () => {
		expect(suggestUsername('  !!Sam!!  ')).toBe('sam');
	});

	it('caps at 24 characters', () => {
		expect(suggestUsername('a'.repeat(50))).toHaveLength(24);
	});

	it('pads short names with three digits', () => {
		expect(suggestUsername('Jo')).toMatch(/^jo\d{3}$/);
	});

	it('uses "friend" when nothing usable is left', () => {
		expect(suggestUsername('李雷')).toMatch(/^friend\d{3}$/);
		expect(suggestUsername('')).toMatch(/^friend\d{3}$/);
	});

	it('always produces a valid username for ordinary names', () => {
		for (const n of ['Sam Smith', 'Zoë', 'Jo', '李雷', 'Anne-Marie de la Cruz', 'x']) {
			expect(usernameProblem(suggestUsername(n))).toBeNull();
		}
	});
});
