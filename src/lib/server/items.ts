import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { db } from './db';
import { item, itemImage, itemLink, itemList, list, santa } from './db/schema';
import { newId } from './ids';
import { addItemToList } from './lists';
import { deleteAllItemImages, importImageFromUrl } from './images';
import { normalisePrice } from './linkMeta';
import { CURRENCIES, formatPrice } from '#lib/format';

export type ItemRow = typeof item.$inferSelect;

export async function requireOwnItem(userId: string, itemId: string): Promise<ItemRow> {
	const [it] = await db.select().from(item).where(and(eq(item.id, itemId), eq(item.ownerId, userId))).limit(1);
	if (!it) error(404, 'Item not found');
	return it;
}

export async function requireOwnList(userId: string, listId: string) {
	const [l] = await db.select().from(list).where(and(eq(list.id, listId), eq(list.ownerId, userId))).limit(1);
	if (!l) error(404, 'List not found');
	return l;
}

export interface ItemInput {
	title: string;
	notes: string | null;
	price: string | null;
	currency: string;
	mostWanted: boolean;
}

/** Validate item fields from a form. Returns an error message or the clean input. */
export function parseItemForm(fd: FormData): { error: string } | { input: ItemInput } {
	const title = String(fd.get('title') ?? '').trim();
	if (!title) return { error: 'Give the wish a name.' };
	if (title.length > 200) return { error: 'Keep the name under 200 characters.' };
	const notes = String(fd.get('notes') ?? '').trim() || null;
	if (notes && notes.length > 2000) return { error: 'Keep notes under 2,000 characters.' };
	const rawPrice = String(fd.get('price') ?? '').trim();
	const price = rawPrice ? normalisePrice(rawPrice) : null;
	if (rawPrice && !price) return { error: 'Enter the price as a number, like 24.99.' };
	const cur = String(fd.get('currency') ?? 'GBP').toUpperCase();
	const currency = (CURRENCIES as readonly string[]).includes(cur) ? cur : 'GBP';
	return { input: { title, notes, price, currency, mostWanted: fd.get('mostWanted') === 'on' } };
}

/**
 * Secret Santa lists only accept items under the exchange's price limit, in its currency.
 * Returns an error message, or null if the item is allowed.
 */
export async function santaPriceProblem(listId: string, it: Pick<ItemRow, 'price' | 'currency'>): Promise<string | null> {
	const [row] = await db
		.select({ priceLimit: santa.priceLimit, currency: santa.currency })
		.from(list)
		.innerJoin(santa, eq(santa.id, list.santaId))
		.where(eq(list.id, listId))
		.limit(1);
	if (!row || row.priceLimit === null) return null;
	const limit = formatPrice(row.priceLimit, row.currency);
	if (it.price === null) return `Add a price first — Secret Santa wishes need to be ${limit} or less.`;
	if (it.currency !== row.currency) return `This Secret Santa uses ${row.currency}. Set the price in ${row.currency}.`;
	if (Number(it.price) > Number(row.priceLimit)) return `That's over the ${limit} limit for this Secret Santa.`;
	return null;
}

export async function createItem(
	ownerId: string,
	input: ItemInput,
	opts: { listIds?: string[]; linkUrl?: string | null } = {}
): Promise<{ itemId: string; linkId: string | null }> {
	const itemId = newId();
	await db.insert(item).values({ id: itemId, ownerId, ...input });
	let linkId: string | null = null;
	if (opts.linkUrl) linkId = await addLink(itemId, opts.linkUrl);
	for (const listId of opts.listIds ?? []) await addItemToList(listId, itemId);
	return { itemId, linkId };
}

export async function addLink(itemId: string, url: string): Promise<string> {
	const [{ m }] = await db.select({ m: max(itemLink.sortOrder) }).from(itemLink).where(eq(itemLink.itemId, itemId));
	const id = newId();
	await db.insert(itemLink).values({ id, itemId, url: url.slice(0, 2048), sortOrder: (m ?? 0) + 1 });
	return id;
}

/** Import up to `limit` pictures; failures are skipped. Returns how many were saved. */
export async function importImages(itemId: string, urls: string[], linkId: string | null, limit = 10) {
	let saved = 0;
	for (const url of urls.slice(0, limit)) {
		try {
			await importImageFromUrl(itemId, url, linkId);
			saved++;
		} catch {
			/* skip images that can't be fetched or decoded */
		}
	}
	return saved;
}

export async function deleteItem(ownerId: string, itemId: string) {
	await requireOwnItem(ownerId, itemId);
	await deleteAllItemImages(itemId);
	await db.delete(item).where(eq(item.id, itemId));
}

/** Lists (owned by the item's owner) that contain this item. */
export async function listsContaining(itemId: string) {
	return db
		.select({ id: list.id, title: list.title })
		.from(itemList)
		.innerJoin(list, eq(list.id, itemList.listId))
		.where(eq(itemList.itemId, itemId))
		.orderBy(asc(list.title));
}

/** Full detail for the item page (owner editor or guest view). */
export async function itemDetail(itemId: string) {
	const [links, images] = await Promise.all([
		db.select().from(itemLink).where(eq(itemLink.itemId, itemId)).orderBy(asc(itemLink.sortOrder), asc(itemLink.createdAt)),
		db.select().from(itemImage).where(eq(itemImage.itemId, itemId)).orderBy(asc(itemImage.sortOrder), asc(itemImage.createdAt))
	]);
	return { links, images };
}

export async function setItemLists(ownerId: string, itemId: string, listIds: string[]) {
	const owned = listIds.length
		? await db.select({ id: list.id }).from(list).where(and(eq(list.ownerId, ownerId), inArray(list.id, listIds)))
		: [];
	const want = new Set(owned.map((l) => l.id));
	const current = await db.select({ listId: itemList.listId }).from(itemList).where(eq(itemList.itemId, itemId));
	const have = new Set(current.map((c) => c.listId));
	for (const id of have) if (!want.has(id)) await db.delete(itemList).where(and(eq(itemList.itemId, itemId), eq(itemList.listId, id)));
	for (const id of want) if (!have.has(id)) await addItemToList(id, itemId);
}
