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
