/**
 * Small in-memory sliding-window limiter. Fine for a single app instance; state resets on restart.
 */
export function createLimiter(opts: { limit: number; windowMs: number; now?: () => number }) {
	const now = opts.now ?? Date.now;
	const hits = new Map<string, number[]>();

	return {
		/** Spend `cost` units for `key`. Returns false (and spends nothing) if that would go over the limit. */
		take(key: string, cost = 1): boolean {
			const t = now();
			const recent = (hits.get(key) ?? []).filter((at) => t - at < opts.windowMs);
			if (recent.length + cost > opts.limit) {
				hits.set(key, recent);
				return false;
			}
			for (let i = 0; i < cost; i++) recent.push(t);
			hits.set(key, recent);
			// Drop idle keys now and then so the map can't grow without bound.
			if (hits.size > 10_000) {
				for (const [k, v] of hits) if (!v.some((at) => t - at < opts.windowMs)) hits.delete(k);
			}
			return true;
		}
	};
}

/** Outbound fetches (shop pages + imported pictures) a user may trigger: 120 per 10 minutes. */
const outbound = createLimiter({ limit: 120, windowMs: 10 * 60 * 1000 });

export const FETCH_LIMIT_MESSAGE = "You've added a lot of links in a short time. Wait a few minutes and try again.";

export function takeFetchBudget(userId: string, cost = 1): boolean {
	return outbound.take(userId, cost);
}
