import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemImage, itemList, list } from '#lib/server/db/schema';
import { imageUrl } from '#lib/images';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const items = await db.select().from(item).where(eq(item.ownerId, me.id)).orderBy(asc(item.title));
	const ids = items.map((i) => i.id);
	const [onLists, covers] = ids.length
		? await Promise.all([
				db
					.select({ itemId: itemList.itemId, listId: list.id, title: list.title })
					.from(itemList)
					.innerJoin(list, eq(list.id, itemList.listId))
					.where(inArray(itemList.itemId, ids)),
				db
					.select({ itemId: itemImage.itemId, key: itemImage.storageKey })
					.from(itemImage)
					.where(inArray(itemImage.itemId, ids))
					.orderBy(asc(itemImage.sortOrder))
			])
		: [[], []];
	const coverBy = new Map<string, string>();
	for (const c of covers) if (!coverBy.has(c.itemId)) coverBy.set(c.itemId, imageUrl(c.key, 'thumb'));
	return {
		items: items.map((i) => ({
			id: i.id,
			title: i.title,
			price: i.price,
			currency: i.currency,
			mostWanted: i.mostWanted,
			cover: coverBy.get(i.id) ?? null,
			lists: onLists.filter((l) => l.itemId === i.id).map((l) => ({ id: l.listId, title: l.title }))
		}))
	};
};
