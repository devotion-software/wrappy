import { describe, expect, it } from 'vitest';
import { spend } from './rateLimit';

const opts = { limit: 3, windowMs: 1000 };

describe('spend', () => {
	it('allows up to the limit, then blocks until the window passes', () => {
		let b = spend(null, 0, 2, opts);
		expect(b).toEqual({ windowStart: 0, used: 2 });
		expect(spend(b, 10, 2, opts)).toBeNull();
		b = spend(b, 10, 1, opts);
		expect(b).toEqual({ windowStart: 0, used: 3 });
		expect(spend(b, 999, 1, opts)).toBeNull();
		expect(spend(b, 1000, 3, opts)).toEqual({ windowStart: 1000, used: 3 });
	});

	it('refuses a single spend bigger than the limit', () => {
		expect(spend(null, 0, 4, opts)).toBeNull();
	});
});

describe('spend — more', () => {
	it('starts a fresh window when there is no bucket', () => {
		expect(spend(null, 500, 1, opts)).toEqual({ windowStart: 500, used: 1 });
	});

	it('does not mutate the bucket it is given', () => {
		const b = { windowStart: 0, used: 1 };
		spend(b, 10, 1, opts);
		expect(b).toEqual({ windowStart: 0, used: 1 });
	});

	it('keeps the original window start while inside the window', () => {
		expect(spend({ windowStart: 100, used: 0 }, 1099, 1, opts)).toEqual({ windowStart: 100, used: 1 });
	});

	it('resets exactly when the window ends, forgetting earlier use', () => {
		expect(spend({ windowStart: 100, used: 3 }, 1100, 1, opts)).toEqual({ windowStart: 1100, used: 1 });
	});

	it('allows zero-cost checks even when full', () => {
		expect(spend({ windowStart: 0, used: 3 }, 1, 0, opts)).toEqual({ windowStart: 0, used: 3 });
	});

	it('blocks a big spend in a fresh window if it exceeds the limit', () => {
		expect(spend({ windowStart: 0, used: 0 }, 5000, 4, opts)).toBeNull();
	});
});
