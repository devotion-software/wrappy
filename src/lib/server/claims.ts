import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { item, itemClaim, itemList } from './db/schema';
import { getListAccess } from './access';
import { fromCents, isFull, pledgedCents, toCents } from './claimView';
import { normalisePrice } from './linkMeta';
import { formatPrice } from '#lib/format';

const claimFail = (itemId: string, message: string, status = 400) => fail(status, { claimError: { itemId, message } });

/** A signed-in guest acting on an item that's on list `params.id`. */
async function guestItem(event: RequestEvent, fd: FormData) {
	const listId = (event.params as { id: string }).id;
	const me = event.locals.user;
	if (!me) redirect(303, `/signin?next=${encodeURIComponent(`/lists/${listId}`)}`);
	const access = await getListAccess(listId, { id: me.id, email: me.email }, event.cookies);
	if (!access) error(404, 'List not found');
	if (access.isOwner) error(403, "You can't claim gifts on your own list.");
	const itemId = String(fd.get('itemId') ?? '');
	const [row] = await db
		.select({ id: item.id, ownerId: item.ownerId })
		.from(itemList)
		.innerJoin(item, eq(item.id, itemList.itemId))
		.where(and(eq(itemList.listId, access.list.id), eq(itemList.itemId, itemId)))
		.limit(1);
	if (!row) error(404, 'Item not found');
	if (row.ownerId === me.id) error(403, "You can't claim your own gifts.");
	return { me, itemId };
}

/**
 * Reserve ("buying") or mark bought. Each claimer takes one of the item's `quantity` (one by
 * default; null means any number). The item row is locked while we count, so two people can't
 * both take the last one.
 */
async function setClaim(event: RequestEvent, status: 'buying' | 'bought') {
	const { me, itemId } = await guestItem(event, await event.request.formData());
	const outcome = await db.transaction(async (tx) => {
		const [it] = await tx
			.select({ quantity: item.quantity, groupGift: item.groupGift, price: item.price })
			.from(item)
			.where(eq(item.id, itemId))
			.for('update');
		const claims = await tx.select().from(itemClaim).where(eq(itemClaim.itemId, itemId));
		const mine = claims.find((c) => c.userId === me.id);
		if (mine) {
			if (mine.status !== status) {
				await tx.update(itemClaim).set({ status }).where(and(eq(itemClaim.itemId, itemId), eq(itemClaim.userId, me.id)));
			}
			return 'ok';
		}
		// Group gifts are joined with an amount (chipIn), not claimed outright.
		if (it.groupGift && it.price !== null) return 'needsAmount';
		if (isFull(it, claims)) return 'full';
		await tx.insert(itemClaim).values({ itemId, userId: me.id, status });
		return 'ok';
	});
	if (outcome === 'full') return claimFail(itemId, 'Someone else got there first.', 409);
	if (outcome === 'needsAmount') return claimFail(itemId, "Say how much you'd like to chip in.");
	return { claimed: itemId };
}

/**
 * Chip in towards a group gift, or change how much. The total can't go past the price; the item
 * row is locked while we add it up.
 */
async function chipIn(event: RequestEvent) {
	const fd = await event.request.formData();
	const { me, itemId } = await guestItem(event, fd);
	const amount = normalisePrice(String(fd.get('amount') ?? ''));
	if (!amount || toCents(amount) <= 0) return claimFail(itemId, 'Enter an amount, like 20.');
	const outcome = await db.transaction(async (tx) => {
		const [it] = await tx
			.select({ groupGift: item.groupGift, price: item.price, currency: item.currency })
			.from(item)
			.where(eq(item.id, itemId))
			.for('update');
		if (!it.groupGift || it.price === null) return { error: "This one isn't a group gift." };
		const claims = await tx.select().from(itemClaim).where(eq(itemClaim.itemId, itemId));
		const mine = claims.find((c) => c.userId === me.id);
		const left = toCents(it.price) - pledgedCents(claims.filter((c) => c.userId !== me.id));
		if (left <= 0) return { full: true };
		if (toCents(amount) > left) {
			return { error: `Only ${formatPrice(fromCents(left), it.currency)} is left to chip in.` };
		}
		if (mine) {
			await tx.update(itemClaim).set({ amount }).where(and(eq(itemClaim.itemId, itemId), eq(itemClaim.userId, me.id)));
		} else {
			await tx.insert(itemClaim).values({ itemId, userId: me.id, status: 'buying', amount });
		}
		return { ok: true };
	});
	if ('full' in outcome) return claimFail(itemId, "It's all covered already.", 409);
	if ('error' in outcome) return claimFail(itemId, outcome.error!);
	return { claimed: itemId };
}

export const claimActions = {
	claim: (event: RequestEvent) => setClaim(event, 'buying'),
	bought: (event: RequestEvent) => setClaim(event, 'bought'),
	chipIn,
	unclaim: async (event: RequestEvent) => {
		const { me, itemId } = await guestItem(event, await event.request.formData());
		await db.delete(itemClaim).where(and(eq(itemClaim.itemId, itemId), eq(itemClaim.userId, me.id)));
		return { unclaimed: itemId };
	}
};
