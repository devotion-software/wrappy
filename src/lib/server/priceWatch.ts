/**
 * Price-drop alerts. Run with the reminders on the hourly timer (see startReminders).
 *
 * Each run re-reads a small batch of shop links (oldest-checked first, at most one per shop, each
 * at most once a day) for items that are still wanted on a live list. A changed price is kept in
 * price_history. A drop of PRICE_DROP_MIN or more (same currency) emails:
 *  - anyone who has reserved the item ("buying"), and
 *  - while it's still up for grabs, people who can see a live list it's on.
 * Never the owner, never someone who's already bought it, and only once per price per person.
 */
import { and, asc, eq, gte, inArray, isNull, lt, or } from 'drizzle-orm';
import { db } from './db';
import { item, itemClaim, itemLink, itemList, list, listShare, listViewer, priceHistory, user } from './db/schema';
import { usersWhoCanSee } from './access';
import { isFull } from './claimView';
import { fetchLinkMeta } from './linkFetch';
import { hostOf } from './lists';
import { newId } from './ids';
import { isoDay, optedOut, sendOnce } from './reminders';
import { unsubscribeToken } from './emailPrefs';
import { sendPriceDropEmail } from './email';
import { formatPrice } from '#lib/format';

const DAY = 24 * 60 * 60 * 1000;
/** Links checked per run. With hourly runs that's under 1,000 shop page fetches a day at most. */
export const CHECKS_PER_RUN = 40;
/** A link is re-read at most this often. */
export const RECHECK_MS = DAY;
/** Smallest drop worth an email (as a fraction of the old price). */
export const PRICE_DROP_MIN = 0.05;

export interface PriceCheckCounts {
	checked: number;
	drops: number;
	emails: number;
}

/** True when `now` is at least PRICE_DROP_MIN below `was`, in the same currency. */
export function isDrop(was: { price: string | null; currency: string | null }, now: { price: string; currency: string }): boolean {
	if (was.price === null || was.currency !== now.currency) return false;
	const before = Number(was.price);
	const after = Number(now.price);
	return before > 0 && after > 0 && after <= before * (1 - PRICE_DROP_MIN);
}

/** Live lists (not archived, date not passed) each candidate item is on. */
async function liveListsByItem(itemIds: string[], today: string) {
	const rows = itemIds.length
		? await db
				.select({ itemId: itemList.itemId, list })
				.from(itemList)
				.innerJoin(list, eq(list.id, itemList.listId))
				.where(and(inArray(itemList.itemId, itemIds), isNull(list.archivedAt), or(isNull(list.eventDate), gte(list.eventDate, today))))
		: [];
	const by = new Map<string, (typeof rows)[number]['list'][]>();
	for (const r of rows) by.set(r.itemId, [...(by.get(r.itemId) ?? []), r.list]);
	return by;
}

export async function runPriceChecks(baseUrl: string, now = new Date(), limit = CHECKS_PER_RUN): Promise<PriceCheckCounts> {
	const today = isoDay(now);
	const due = await db
		.select({ link: itemLink, item })
		.from(itemLink)
		.innerJoin(item, eq(item.id, itemLink.itemId))
		.where(and(isNull(item.archivedAt), or(isNull(itemLink.checkedAt), lt(itemLink.checkedAt, new Date(now.getTime() - RECHECK_MS)))))
		.orderBy(asc(itemLink.checkedAt), asc(itemLink.createdAt))
		.limit(limit * 5);
	if (!due.length) return { checked: 0, drops: 0, emails: 0 };

	const ids = [...new Set(due.map((d) => d.item.id))];
	const [live, claims] = await Promise.all([
		liveListsByItem(ids, today),
		db.select().from(itemClaim).where(inArray(itemClaim.itemId, ids))
	]);
	const claimsBy = new Map<string, (typeof claims)[number][]>();
	for (const c of claims) claimsBy.set(c.itemId, [...(claimsBy.get(c.itemId) ?? []), c]);
	const allBought = (it: typeof item.$inferSelect) =>
		isFull(it, (claimsBy.get(it.id) ?? []).filter((c) => c.status === 'bought'));

	// One link per shop per run, so no shop sees more than a trickle of requests from us.
	const hosts = new Set<string>();
	const batch: typeof due = [];
	const notWanted: string[] = [];
	for (const d of due) {
		if (batch.length >= limit) break;
		if (!live.get(d.item.id)?.length || allBought(d.item)) {
			notWanted.push(d.link.id);
			continue;
		}
		const host = hostOf(d.link.url);
		if (hosts.has(host)) continue;
		hosts.add(host);
		batch.push(d);
	}

	// Skip links nobody needs any more until tomorrow, so they don't crowd out the rest.
	if (notWanted.length) await db.update(itemLink).set({ checkedAt: now }).where(inArray(itemLink.id, notWanted));

	const counts: PriceCheckCounts = { checked: 0, drops: 0, emails: 0 };
	for (const { link, item: it } of batch) {
		const meta = await fetchLinkMeta(link.url);
		counts.checked++;
		const price = meta?.price ?? null;
		const currency = meta?.currency ?? link.lastCurrency ?? it.currency;
		if (!price) {
			await db.update(itemLink).set({ checkedAt: now }).where(eq(itemLink.id, link.id));
			continue;
		}
		const changed = price !== link.lastPrice || currency !== link.lastCurrency;
		await db.update(itemLink).set({ checkedAt: now, lastPrice: price, lastCurrency: currency }).where(eq(itemLink.id, link.id));
		if (changed) await db.insert(priceHistory).values({ id: newId(), linkId: link.id, price, currency, seenAt: now });
		if (!isDrop({ price: link.lastPrice, currency: link.lastCurrency }, { price, currency })) continue;
		counts.drops++;
		counts.emails += await alert(baseUrl, it, link, { was: link.lastPrice!, now: price, currency }, live.get(it.id)!, claimsBy.get(it.id) ?? []);
	}
	return counts;
}

async function alert(
	baseUrl: string,
	it: typeof item.$inferSelect,
	link: typeof itemLink.$inferSelect,
	drop: { was: string; now: string; currency: string },
	lists: (typeof list.$inferSelect)[],
	claims: (typeof itemClaim.$inferSelect)[]
): Promise<number> {
	const buying = claims.filter((c) => c.status === 'buying').map((c) => c.userId);
	const bought = new Set(claims.filter((c) => c.status === 'bought').map((c) => c.userId));
	const open = !isFull(it, claims);

	// Everyone who might get it: reservers, plus (while it's open) people who've opened or been invited to a list it's on.
	let watchers = [...buying];
	if (open) {
		const listIds = lists.map((l) => l.id);
		const [viewers, shares] = await Promise.all([
			db.select({ userId: listViewer.userId }).from(listViewer).where(inArray(listViewer.listId, listIds)),
			db.select({ userId: listShare.userId }).from(listShare).where(inArray(listShare.listId, listIds))
		]);
		watchers.push(...[...viewers, ...shares].map((r) => r.userId).filter((id): id is string => !!id));
	}
	watchers = [...new Set(watchers)].filter((id) => id !== it.ownerId && !bought.has(id));
	if (!watchers.length) return 0;

	const off = await optedOut(watchers, 'price');
	const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, it.ownerId));
	const people = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, watchers));
	let sent = 0;
	for (const p of people) {
		if (off.has(p.id)) continue;
		// A list this person can actually open, for the link in the email.
		let listId: string | null = null;
		for (const l of lists) {
			if ((await usersWhoCanSee(l, [p.id])).has(p.id)) {
				listId = l.id;
				break;
			}
		}
		if (!listId) continue;
		const ok = await sendOnce('price', `${link.id}:${drop.now}`, p.id, () =>
			sendPriceDropEmail({
				email: p.email,
				url: `${baseUrl}/lists/${listId}/items/${it.id}`,
				unsubscribeUrl: `${baseUrl}/unsubscribe/${unsubscribeToken(p.id, 'price')}`,
				settingsUrl: `${baseUrl}/account#emails`,
				ownerName: owner?.name ?? 'Someone',
				itemTitle: it.title,
				shop: hostOf(link.url),
				was: formatPrice(drop.was, drop.currency)!,
				now: formatPrice(drop.now, drop.currency)!
			})
		);
		if (ok) sent++;
	}
	return sent;
}
