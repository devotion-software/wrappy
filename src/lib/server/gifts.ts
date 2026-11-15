import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { giftContact, item, itemClaim, itemImage, receivedFrom, receivedGift, user } from './db/schema';
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
		// This query filters on giverId, so it's always set here.
		noted: noted.map((n): NotedGift => ({ kind: 'noted', ...n, giverId: n.giverId! }))
	};
}

async function requireKnownGiver(ownerId: string, giverId: string) {
	if (!(await knownPeople(ownerId)).some((p) => p.id === giverId)) error(400, 'Pick someone from the list.');
}

export interface Contact {
	id: string;
	name: string;
}

/** The owner's contacts (people without an account), A–Z. */
export async function contactsOf(ownerId: string): Promise<Contact[]> {
	return db
		.select({ id: giftContact.id, name: giftContact.name })
		.from(giftContact)
		.where(eq(giftContact.ownerId, ownerId))
		.orderBy(asc(giftContact.name));
}

export async function getContact(ownerId: string, contactId: string): Promise<Contact | null> {
	const [c] = await db
		.select({ id: giftContact.id, name: giftContact.name })
		.from(giftContact)
		.where(and(eq(giftContact.id, contactId), eq(giftContact.ownerId, ownerId)))
		.limit(1);
	return c ?? null;
}

/** Presents the owner noted from these contacts. */
export async function giftsFromContacts(ownerId: string, contactIds: string[]) {
	if (!contactIds.length) return [];
	const rows = await db
		.select({ id: receivedGift.id, title: receivedGift.title, contactId: receivedGift.contactId })
		.from(receivedGift)
		.where(and(eq(receivedGift.ownerId, ownerId), inArray(receivedGift.contactId, contactIds)))
		.orderBy(asc(receivedGift.createdAt));
	return rows.map((r) => ({ kind: 'noted' as const, id: r.id, title: r.title, giverId: r.contactId! }));
}

function cleanTitle(raw: FormDataEntryValue | null): { title: string } | { error: string } {
	const title = String(raw ?? '').trim();
	if (!title) return { error: 'Write what they gave you.' };
	if (title.length > 200) return { error: 'Keep it under 200 characters.' };
	return { title };
}

/** Form actions for noting extra gifts, shared by /gifts and /gifts/[giverId]. */
export const giftNoteActions = {
	/** Note a present from an account holder (giverId) or a contact (contactId). */
	addGift: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const giverId = String(fd.get('giverId') ?? '') || null;
		const contactId = String(fd.get('contactId') ?? '') || null;
		const key = giverId ?? contactId ?? '';
		const t = cleanTitle(fd.get('title'));
		if ('error' in t) return fail(400, { giftError: { giverId: key, message: t.error } });

		if (giverId) {
			await requireKnownGiver(me.id, giverId);
			// Noting a present means you've received from them, so their bought wishes show too.
			await db.insert(receivedFrom).values({ ownerId: me.id, giverId }).onDuplicateKeyUpdate({ set: { giverId } });
			await db.insert(receivedGift).values({ id: newId(), ownerId: me.id, giverId, title: t.title });
		} else if (contactId) {
			if (!(await getContact(me.id, contactId))) error(404, 'Person not found');
			await db.insert(receivedGift).values({ id: newId(), ownerId: me.id, contactId, title: t.title });
		} else {
			error(400, 'Pick who gave it to you.');
		}
		return { giftAdded: key };
	},

	removeGift: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const id = String((await request.formData()).get('giftId') ?? '');
		await db.delete(receivedGift).where(and(eq(receivedGift.id, id), eq(receivedGift.ownerId, me.id)));
		return { giftRemoved: true };
	},

	/** Add someone without an account, optionally with their first present. Reuses an existing name. */
	addContact: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		if (!name) return fail(400, { contactError: 'Add their name.' });
		if (name.length > 80) return fail(400, { contactError: 'Keep the name under 80 characters.' });
		const rawTitle = String(fd.get('title') ?? '').trim();
		const t = rawTitle ? cleanTitle(rawTitle) : null;
		if (t && 'error' in t) return fail(400, { contactError: t.error });

		// The unique index is case-insensitive (MariaDB collation), so "grandma jo" reuses "Grandma Jo".
		await db
			.insert(giftContact)
			.values({ id: newId(), ownerId: me.id, name })
			.onDuplicateKeyUpdate({ set: { name: sql`${giftContact.name}` } });
		const [c] = await db
			.select({ id: giftContact.id })
			.from(giftContact)
			.where(and(eq(giftContact.ownerId, me.id), eq(giftContact.name, name)))
			.limit(1);
		if (t) await db.insert(receivedGift).values({ id: newId(), ownerId: me.id, contactId: c.id, title: t.title });
		return { contactAdded: c.id };
	},

	renameContact: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const contactId = String(fd.get('contactId') ?? '');
		const name = String(fd.get('name') ?? '').trim();
		if (!(await getContact(me.id, contactId))) error(404, 'Person not found');
		if (!name) return fail(400, { renameError: 'Add their name.' });
		if (name.length > 80) return fail(400, { renameError: 'Keep the name under 80 characters.' });
		try {
			await db.update(giftContact).set({ name }).where(and(eq(giftContact.id, contactId), eq(giftContact.ownerId, me.id)));
		} catch {
			return fail(400, { renameError: `You already have someone called ${name}.` });
		}
		return { renamed: true };
	}
};

export async function personName(userId: string): Promise<string | null> {
	const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
	return u?.name ?? null;
}
