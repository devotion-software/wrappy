import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { item, itemClaim, itemList } from './db/schema';
import { getListAccess } from './access';

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
		const [it] = await tx.select({ quantity: item.quantity }).from(item).where(eq(item.id, itemId)).for('update');
		const claims = await tx.select().from(itemClaim).where(eq(itemClaim.itemId, itemId));
		const mine = claims.find((c) => c.userId === me.id);
		if (mine) {
			if (mine.status !== status) {
				await tx.update(itemClaim).set({ status }).where(and(eq(itemClaim.itemId, itemId), eq(itemClaim.userId, me.id)));
			}
			return 'ok';
		}
		if (it.quantity !== null && claims.length >= it.quantity) return 'full';
		await tx.insert(itemClaim).values({ itemId, userId: me.id, status });
		return 'ok';
	});
	if (outcome === 'full') return fail(409, { claimError: { itemId, message: 'Someone else got there first.' } });
	return { claimed: itemId };
}

export const claimActions = {
	claim: (event: RequestEvent) => setClaim(event, 'buying'),
	bought: (event: RequestEvent) => setClaim(event, 'bought'),
	unclaim: async (event: RequestEvent) => {
		const { me, itemId } = await guestItem(event, await event.request.formData());
		await db.delete(itemClaim).where(and(eq(itemClaim.itemId, itemId), eq(itemClaim.userId, me.id)));
		return { unclaimed: itemId };
	}
};
