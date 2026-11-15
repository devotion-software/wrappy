import { describe, expect, it } from 'vitest';
import { drawAssignments } from './santaDraw';

function check(map: Map<string, string>, ids: string[], excl: [string, string][] = []) {
	expect(map.size).toBe(ids.length);
	expect(new Set(map.values()).size).toBe(ids.length);
	for (const [g, r] of map) {
		expect(g).not.toBe(r);
		for (const [a, b] of excl) {
			expect([g, r].sort()).not.toEqual([a, b].sort());
		}
	}
}

describe('drawAssignments', () => {
	it('needs at least two people', () => {
		expect(drawAssignments(['a'])).toBeNull();
	});

	it('pairs two people with each other', () => {
		const m = drawAssignments(['a', 'b'])!;
		expect(m.get('a')).toBe('b');
		expect(m.get('b')).toBe('a');
	});

	it('produces a valid draw many times over', () => {
		const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		for (let i = 0; i < 200; i++) check(drawAssignments(ids)!, ids);
	});

	it('respects exclusions in both directions', () => {
		const ids = ['a', 'b', 'c', 'd'];
		const excl: [string, string][] = [
			['a', 'b'],
			['c', 'd']
		];
		for (let i = 0; i < 200; i++) check(drawAssignments(ids, excl)!, ids, excl);
	});

	it('returns null when exclusions make a draw impossible', () => {
		expect(drawAssignments(['a', 'b'], [['a', 'b']])).toBeNull();
		// c is excluded from everyone
		expect(
			drawAssignments(
				['a', 'b', 'c'],
				[
					['c', 'a'],
					['c', 'b']
				]
			)
		).toBeNull();
	});
});
