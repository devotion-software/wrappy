import { describe, expect, it } from 'vitest';
import { createLimiter } from './rateLimit';

describe('createLimiter', () => {
	it('allows up to the limit, then blocks until the window passes', () => {
		let t = 0;
		const l = createLimiter({ limit: 3, windowMs: 1000, now: () => t });
		expect(l.take('a', 2)).toBe(true);
		expect(l.take('a', 2)).toBe(false);
		expect(l.take('a')).toBe(true);
		expect(l.take('a')).toBe(false);
		expect(l.take('b')).toBe(true);
		t = 1000;
		expect(l.take('a', 3)).toBe(true);
	});
});
