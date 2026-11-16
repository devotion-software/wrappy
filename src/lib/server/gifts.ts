import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './db';
import { giftAttribution, giftContact, giftThanks, item, itemClaim, itemImage, receivedFrom, receivedGift, user } from './db/schema';
import { knownPeople } from './lists';
import { newId } from './ids';
import { imageUrl } from '#lib/images';

/**
 * People are keyed by id: an account's user id or a contact's id. Both are random,
 * different lengths, and never collide, so one string identifies either.
 */
export interface GiftFromList {
	kind: 'list';
	/** `itemId:claimerId`: an item wanted more than once can be bought by several people. */
	id: string;
	itemId: string;
	/** Who marked it bought (before any correction by the owner). */
	claimerId: string;
	title: string;
	price: string | null;
	currency: string;
	cover: string | null;
	/** Who it's shown as from: the owner's correction if any, else whoever marked it bought. */
	giverId: string;
	/** True when the owner reassigned it away from the person who claimed it. */
	reassigned: boolean;
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
 * Every present the owner can see, grouped later by person:
 *  - wishes marked BOUGHT on their lists, by someone they've marked received from
 *    ("buying" is never revealed), or that they've already reassigned;
 *  - presents they noted themselves.
 * The owner's reassignments (gift_attribution) decide who a bought wish is shown as from.
 */
export async function allReceived(ownerId: string): Promise<{ fromLists: GiftFromList[]; noted: NotedGift[] }> {
	const [revealed, bought, attributions, noted] = await Promise.all([
		revealedGivers(ownerId),
		db
			.select({ itemId: item.id, title: item.title, price: item.price, currency: item.currency, claimerId: itemClaim.userId })
			.from(itemClaim)
			.innerJoin(item, eq(item.id, itemClaim.itemId))
			.where(and(eq(item.ownerId, ownerId), eq(itemClaim.status, 'bought')))
			.orderBy(asc(item.title)),
		db
			.select({
				itemId: giftAttribution.itemId,
				claimerId: giftAttribution.claimerId,
				giverId: giftAttribution.giverId,
				contactId: giftAttribution.contactId
			})
			.from(giftAttribution)
			.where(eq(giftAttribution.ownerId, ownerId)),
		db
			.select({ id: receivedGift.id, title: receivedGift.title, giverId: receivedGift.giverId, contactId: receivedGift.contactId })
			.from(receivedGift)
			.where(eq(receivedGift.ownerId, ownerId))
			.orderBy(asc(receivedGift.createdAt))
	]);

	const revealedSet = new Set(revealed);
	const key = (g: { itemId: string; claimerId: string }) => `${g.itemId}:${g.claimerId}`;
	const attrBy = new Map(attributions.map((a) => [key(a), (a.giverId ?? a.contactId)!]));
	const visible = bought.filter((b) => revealedSet.has(b.claimerId) || attrBy.has(key(b)));

	const ids = visible.map((g) => g.itemId);
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
		fromLists: visible.map((b) => {
			const shownAs = attrBy.get(key(b)) ?? b.claimerId;
			return {
				kind: 'list',
				id: key(b),
				itemId: b.itemId,
				claimerId: b.claimerId,
				title: b.title,
				price: b.price,
				currency: b.currency,
				cover: coverBy.get(b.itemId) ?? null,
				giverId: shownAs,
				reassigned: shownAs !== b.claimerId
			};
		}),
		noted: noted.map((n) => ({ kind: 'noted', id: n.id, title: n.title, giverId: (n.giverId ?? n.contactId)! }))
	};
}

/** Everyone a present can be from: account holders you know, then your contacts. */
export async function giverOptions(ownerId: string) {
	const [people, contacts] = await Promise.all([knownPeople(ownerId), contactsOf(ownerId)]);
	return [
		...people.map((p) => ({ id: p.id, name: p.name, isContact: false })),
		...contacts.map((c) => ({ id: c.id, name: c.name, isContact: true }))
	];
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

	/**
	 * Change who a present was from. `kind` is 'list' (a bought item, by `itemId:claimerId`) or 'noted'
	 * (by giftId). `to` is a person id, or 'new' with `newName` to add a contact on the fly.
	 * For bought wishes only the owner's private record changes — the claim is untouched.
	 */
	reassign: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const kind = String(fd.get('kind') ?? '');
		const id = String(fd.get('id') ?? '');
		const to = String(fd.get('to') ?? '');
		const fail400 = (message: string) => fail(400, { reassignError: { id, message } });

		// Resolve the new giver.
		let target: { giverId: string | null; contactId: string | null };
		if (to === 'new') {
			const name = String(fd.get('newName') ?? '').trim();
			if (!name) return fail400('Add their name.');
			if (name.length > 80) return fail400('Keep the name under 80 characters.');
			await db
				.insert(giftContact)
				.values({ id: newId(), ownerId: me.id, name })
				.onDuplicateKeyUpdate({ set: { name: sql`${giftContact.name}` } });
			const [c] = await db
				.select({ id: giftContact.id })
				.from(giftContact)
				.where(and(eq(giftContact.ownerId, me.id), eq(giftContact.name, name)))
				.limit(1);
			target = { giverId: null, contactId: c.id };
		} else if (await getContact(me.id, to)) {
			target = { giverId: null, contactId: to };
		} else if ((await knownPeople(me.id)).some((p) => p.id === to)) {
			target = { giverId: to, contactId: null };
		} else {
			return fail400('Pick who it was from.');
		}

		if (kind === 'noted') {
			await db
				.update(receivedGift)
				.set(target)
				.where(and(eq(receivedGift.id, id), eq(receivedGift.ownerId, me.id)));
			return { reassigned: id };
		}

		if (kind !== 'list') error(400, 'Unknown present');
		// Only presents the owner can already see may be reassigned.
		const gift = (await allReceived(me.id)).fromLists.find((g) => g.id === id);
		if (!gift) error(404, 'Present not found');
		const { itemId, claimerId } = gift;
		if (target.giverId && target.giverId === claimerId) {
			// Back to the person who marked it bought: no correction needed.
			await db
				.delete(giftAttribution)
				.where(and(eq(giftAttribution.itemId, itemId), eq(giftAttribution.claimerId, claimerId), eq(giftAttribution.ownerId, me.id)));
		} else {
			await db
				.insert(giftAttribution)
				.values({ itemId, claimerId, ownerId: me.id, ...target })
				.onDuplicateKeyUpdate({ set: target });
		}
		return { reassigned: id };
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

/** People (account or contact ids) the owner has marked as thanked. */
export async function thankedPeople(ownerId: string): Promise<string[]> {
	const rows = await db.select({ personId: giftThanks.personId }).from(giftThanks).where(eq(giftThanks.ownerId, ownerId));
	return rows.map((r) => r.personId);
}

/**
 * Tick or untick "thanked" for someone who gave you something. Unlike "received from" this can be
 * undone freely: it only records what the owner has done, it reveals nothing.
 */
export const thanksActions = {
	thanked: async ({ locals, request }: RequestEvent) => {
		const me = locals.user!;
		const fd = await request.formData();
		const personId = String(fd.get('personId') ?? '');
		const on = String(fd.get('on') ?? '1') !== '0';
		if (on) {
			const isKnown =
				(await knownPeople(me.id)).some((p) => p.id === personId) || !!(await getContact(me.id, personId));
			if (!isKnown) error(400, 'Pick someone from the list.');
			await db.insert(giftThanks).values({ ownerId: me.id, personId }).onDuplicateKeyUpdate({ set: { personId } });
		} else {
			await db.delete(giftThanks).where(and(eq(giftThanks.ownerId, me.id), eq(giftThanks.personId, personId)));
		}
		return { thanked: { personId, on } };
	}
};

export async function personName(userId: string): Promise<string | null> {
	const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1);
	return u?.name ?? null;
}
