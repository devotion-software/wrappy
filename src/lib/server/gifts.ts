import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { item, itemClaim, itemImage, receivedFrom, receivedGift, user } from './db/schema';
import { knownPeople } from './lists';
import { newId } from './ids';
import { imageUrl } from '#lib/images';

export interface GiftFromList {
	kind: 'list';
	itemId: string;
	title: string;
	price: string | null;
	currency: string;
	cover: string | null;
	giverId: string;
}
export interface NotedGift {
	kind: 'noted';
	id: string;
	title: string;
	giverId: string;
}

/** Givers the owner has marked "received from". */
export async function revealedGivers(ownerId: string): Promise<string[]> {
	const rows = await db.select({ giverId: receivedFrom.giverId }).from(receivedFrom).where(eq(receivedFrom.ownerId, ownerId));
	return rows.map((r) => r.giverId);
}

/**
 * Everything these givers gave the owner: wishes they marked BOUGHT on the owner's lists
 * (only for givers the owner has marked received from — "buying" is never revealed),
 * plus gifts the owner noted themselves.
 */
export async function giftsFrom(ownerId: string, giverIds: string[]) {
	const revealed = new Set(await revealedGivers(ownerId));
	const listGivers = giverIds.filter((g) => revealed.has(g));
	const [fromLists, noted] = await Promise.all([
		listGivers.length
			? db
					.select({
						itemId: item.id,
						title: item.title,
						price: item.price,
						currency: item.currency,
						giverId: itemClaim.userId
					})
					.from(itemClaim)
					.innerJoin(item, eq(item.id, itemClaim.itemId))
					.where(and(eq(item.ownerId, ownerId), eq(itemClaim.status, 'bought'), inArray(itemClaim.userId, listGivers)))
					.orderBy(asc(item.title))
			: [],
		giverIds.length
			? db
					.select({ id: receivedGift.id, title: receivedGift.title, giverId: receivedGift.giverId })
					.from(receivedGift)
					.where(and(eq(receivedGift.ownerId, ownerId), inArray(receivedGift.giverId, giverIds)))
					.orderBy(asc(receivedGift.createdAt))
			: []
	]);

	const ids = fromLists.map((g) => g.itemId);
	const covers = ids.length
		? await db
				.select({ itemId: itemImage.itemId, key: itemImage.storageKey })
				.from(itemImage)
				.where(inArray(itemImage.itemId, ids))
				.orderBy(asc(itemImage.sortOrder))
		: [];
	const coverBy = new Map<string, string>();
	for (const c of covers) if (!coverBy.has(c.itemId)) coverBy.set(c.itemId, imageUrl(c.key, 'thumb'));

	return {
		fromLists: fromLists.map((g): GiftFromList => ({ kind: 'list', ...g, cover: coverBy.get(g.itemId) ?? null })),
		noted: noted.map((n): NotedGift => ({ kind: 'noted', ...n }))
	};
}

async function requireKnownGiver(ownerId: string, giverId: string) {
	if (!(await knownPeople(ownerId)).some((p) => p.id === giverId)) error(400, 'Pick someone from the list.');
}

/** Form actions for noting extra gifts, shared by /gifts and /gifts/[giverId]. */
export const giftNoteActions = {
	addGift: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const giverId = String(fd.get('giverId') ?? '');
		const title = String(fd.get('title') ?? '').trim();
		await requireKnownGiver(me.id, giverId);
		if (!title) return fail(400, { giftError: { giverId, message: 'Write what they gave you.' } });
		if (title.length > 200) return fail(400, { giftError: { giverId, message: 'Keep it under 200 characters.' } });
		// Noting a present means you've received from them, so their bought wishes show too.
		await db.insert(receivedFrom).values({ ownerId: me.id, giverId }).onDuplicateKeyUpdate({ set: { giverId } });
		await db.insert(receivedGift).values({ id: newId(), ownerId: me.id, giverId, title });
		return { giftAdded: giverId };
	},
	removeGift: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const id = String((await request.formData()).get('giftId') ?? '');
		await db.delete(receivedGift).where(and(eq(receivedGift.id, id), eq(receivedGift.ownerId, me.id)));
		return { giftRemoved: true };
	}
};

export async function personName(userId: string): Promise<string | null> {
	const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
	return u?.name ?? null;
}
