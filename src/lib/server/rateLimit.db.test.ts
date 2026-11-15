import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { rateBucket } from './db/schema';
import { createLimiter, takeFetchBudget } from './rateLimit';
import { uniq } from '../../../tests/helpers/fixtures';

const bucket = async (key: string) => (await db.select().from(rateBucket).where(eq(rateBucket.key, key)))[0] ?? null;

beforeEach(() => {
	// Keep the occasional cleanup sweep out of tests that don't ask for it.
	vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterEach(() => vi.restoreAllMocks());

describe('createLimiter', () => {
	it('allows up to the limit, then refuses without spending', async () => {
		const name = `t-${uniq()}`;
		const lim = createLimiter(name, { limit: 3, windowMs: 60_000 });
		expect(await lim.take('k')).toBe(true);
		expect(await lim.take('k', 2)).toBe(true);
		expect(await lim.take('k')).toBe(false);
		expect(await bucket(`${name}:k`)).toMatchObject({ used: 3 });
	});

	it('refuses a cost that would overshoot even when some budget is left', async () => {
		const name = `t-${uniq()}`;
		const lim = createLimiter(name, { limit: 5, windowMs: 60_000 });
		expect(await lim.take('k', 4)).toBe(true);
		expect(await lim.take('k', 2)).toBe(false);
		expect(await lim.take('k', 1)).toBe(true);
		expect(await lim.take('big', 6)).toBe(false);
	});

	it('keeps separate counts per key and per limiter name', async () => {
		const name = `t-${uniq()}`;
		const a = createLimiter(name, { limit: 1, windowMs: 60_000 });
		const b = createLimiter(`${name}-b`, { limit: 1, windowMs: 60_000 });
		expect(await a.take('x')).toBe(true);
		expect(await a.take('x')).toBe(false);
		expect(await a.take('y')).toBe(true);
		expect(await b.take('x')).toBe(true);
	});

	it('starts a fresh window once the old one has passed', async () => {
		const name = `t-${uniq()}`;
		const lim = createLimiter(name, { limit: 2, windowMs: 1000 });
		const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
		expect(await lim.take('k', 2)).toBe(true);
		now.mockReturnValue(1_000_999);
		expect(await lim.take('k')).toBe(false);
		now.mockReturnValue(1_001_000);
		expect(await lim.take('k')).toBe(true);
		expect(await bucket(`${name}:k`)).toEqual({ key: `${name}:k`, windowStart: 1_001_000, used: 1 });
	});

	it('never overspends under concurrent requests', async () => {
		const name = `t-${uniq()}`;
		const lim = createLimiter(name, { limit: 5, windowMs: 60_000 });
		const results = await Promise.all(Array.from({ length: 12 }, () => lim.take('k')));
		expect(results.filter(Boolean)).toHaveLength(5);
		expect(await bucket(`${name}:k`)).toMatchObject({ used: 5 });
	});

	it('now and then sweeps long-idle buckets', async () => {
		const name = `t-${uniq()}`;
		const stale = `${name}:stale`;
		await db.insert(rateBucket).values({ key: stale, windowStart: 0, used: 1 });
		// A window so long that only a bucket from 1970 counts as idle.
		const lim = createLimiter(name, { limit: 1, windowMs: Date.now() - 1000 });
		vi.mocked(Math.random).mockReturnValue(0);
		expect(await lim.take('fresh')).toBe(true);
		expect(await bucket(stale)).toBeNull();
		expect(await bucket(`${name}:fresh`)).not.toBeNull();
	});
});

describe('takeFetchBudget', () => {
	it('allows 120 outbound fetches per user per window', async () => {
		const user = `u-${uniq()}`;
		expect(await takeFetchBudget(user, 119)).toBe(true);
		expect(await takeFetchBudget(user)).toBe(true);
		expect(await takeFetchBudget(user)).toBe(false);
		expect(await takeFetchBudget(`u-${uniq()}`, 10)).toBe(true);
	});
});
