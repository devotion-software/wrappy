import { eq, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { rateBucket } from './db/schema';

type Bucket = { windowStart: number; used: number };
type Opts = { limit: number; windowMs: number };

/**
 * Fixed-window decision: the bucket after spending `cost` at time `now`, or null if that would go
 * over the limit (in which case nothing is spent). Pure so it can be tested without a database.
 */
export function spend(bucket: Bucket | null, now: number, cost: number, opts: Opts): Bucket | null {
	const fresh = !bucket || now - bucket.windowStart >= opts.windowMs;
	const current = fresh ? { windowStart: now, used: 0 } : bucket;
	if (current.used + cost > opts.limit) return null;
	return { windowStart: current.windowStart, used: current.used + cost };
}

/**
 * Database-backed limiter, so every app instance shares the same counts.
 * The row is locked for the read-modify-write, so concurrent requests can't overspend.
 */
export function createLimiter(name: string, opts: Opts) {
	return {
		/** Spend `cost` units for `key`. Returns false (and spends nothing) if that would go over the limit. */
		async take(key: string, cost = 1): Promise<boolean> {
			const id = `${name}:${key}`;
			const now = Date.now();
			// Make sure the row exists so FOR UPDATE has something to lock. Done outside the transaction:
			// inside it, the duplicate-key check's shared lock deadlocks against concurrent FOR UPDATEs.
			await db.insert(rateBucket).ignore().values({ key: id, windowStart: now, used: 0 });
			const allowed = await db.transaction(async (tx) => {
				const [row] = await tx.select().from(rateBucket).where(eq(rateBucket.key, id)).for('update');
				const next = spend(row ?? null, now, cost, opts);
				if (!next) return false;
				await tx.update(rateBucket).set(next).where(eq(rateBucket.key, id));
				return true;
			});
			// Drop long-idle buckets now and then so the table can't grow without bound.
			if (Math.random() < 0.01) {
				await db
					.delete(rateBucket)
					.where(lt(rateBucket.windowStart, sql`${now - opts.windowMs}`))
					.catch(() => {});
			}
			return allowed;
		}
	};
}

/** Outbound fetches (shop pages + imported pictures) a user may trigger: 120 per 10 minutes. */
const outbound = createLimiter('fetch', { limit: 120, windowMs: 10 * 60 * 1000 });

export const FETCH_LIMIT_MESSAGE = "You've added a lot of links in a short time. Wait a few minutes and try again.";

export function takeFetchBudget(userId: string, cost = 1): Promise<boolean> {
	return outbound.take(userId, cost);
}

/** Group invite emails a user may send: 30 an hour. */
const groupInvites = createLimiter('group-invite', { limit: 30, windowMs: 60 * 60 * 1000 });

export function takeGroupInviteBudget(userId: string): Promise<boolean> {
	return groupInvites.take(userId);
}

/** Secret Santa messages a user may send: 40 an hour. */
const santaMessages = createLimiter('santa-msg', { limit: 40, windowMs: 60 * 60 * 1000 });

export function takeMessageBudget(userId: string): Promise<boolean> {
	return santaMessages.take(userId);
}
