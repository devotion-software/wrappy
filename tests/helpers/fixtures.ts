/**
 * Row factories for database tests. Every row gets a random id and unique-ish name, so tests
 * can share one database (and run again without cleaning up) without seeing each other's data.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import {
	giftContact,
	item,
	itemClaim,
	itemImage,
	itemLink,
	itemList,
	itemSuggestion,
	list,
	listShare,
	listViewer,
	receivedFrom,
	santa,
	santaMember,
	user
} from '#lib/server/db/schema';
import { newId, newToken } from '#lib/server/ids';
import type { User } from '#lib/auth';

/** Short random suffix so names and emails are unique per test run. */
export const uniq = () => newId().slice(0, 8).toLowerCase();

export type TestUser = User;

export async function createUser(over: Partial<{ name: string; email: string; username: string | null; theme: string }> = {}): Promise<TestUser> {
	const id = newId();
	const tag = uniq();
	const row = {
		id,
		name: over.name ?? `User ${tag}`,
		email: (over.email ?? `user-${tag}@example.test`).toLowerCase(),
		emailVerified: true,
		username: over.username === undefined ? null : over.username,
		theme: over.theme ?? 'system'
	};
	await db.insert(user).values(row);
	const [u] = await db.select().from(user).where(eq(user.id, id));
	return u as TestUser;
}

export async function createList(
	owner: { id: string },
	over: Partial<typeof list.$inferInsert> = {}
): Promise<typeof list.$inferSelect> {
	const id = over.id ?? newId();
	await db.insert(list).values({ id, ownerId: owner.id, title: `List ${uniq()}`, visibility: 'private', ...over });
	const [l] = await db.select().from(list).where(eq(list.id, id));
	return l;
}

export async function createItem(
	owner: { id: string },
	over: Partial<typeof item.$inferInsert> = {},
	opts: { lists?: { id: string }[] } = {}
): Promise<typeof item.$inferSelect> {
	const id = over.id ?? newId();
	await db.insert(item).values({ id, ownerId: owner.id, title: `Wish ${uniq()}`, ...over });
	let order = 1;
	for (const l of opts.lists ?? []) await addToList(l, { id }, order++);
	const [it] = await db.select().from(item).where(eq(item.id, id));
	return it;
}

export async function addToList(l: { id: string }, it: { id: string }, sortOrder = 0) {
	await db.insert(itemList).values({ listId: l.id, itemId: it.id, sortOrder });
}

export async function addLink(it: { id: string }, url: string, sortOrder = 1) {
	const id = newId();
	await db.insert(itemLink).values({ id, itemId: it.id, url, sortOrder });
	return id;
}

/** An image row only (no stored files): enough for cover/count logic. */
export async function addImageRow(it: { id: string }, sortOrder = 1, linkId: string | null = null) {
	const id = newId();
	await db.insert(itemImage).values({ id, itemId: it.id, source: 'upload', linkId, storageKey: `items/${it.id}/${id}`, sortOrder });
	return id;
}

export async function claim(it: { id: string }, by: { id: string }, status: 'buying' | 'bought' = 'buying') {
	await db.insert(itemClaim).values({ itemId: it.id, userId: by.id, status });
}

export async function suggest(it: { id: string }, who: { id: string }) {
	await db.insert(itemSuggestion).values({ itemId: it.id, userId: who.id });
}

export async function share(l: { id: string }, to: { email: string; id?: string | null }) {
	const id = newId();
	await db.insert(listShare).values({ id, listId: l.id, email: to.email.toLowerCase(), userId: to.id ?? null });
	return id;
}

export async function view(l: { id: string }, who: { id: string }, viaLink = false) {
	await db.insert(listViewer).values({ listId: l.id, userId: who.id, viaLink });
}

export async function markReceived(owner: { id: string }, giver: { id: string }) {
	await db.insert(receivedFrom).values({ ownerId: owner.id, giverId: giver.id });
}

export async function createContact(owner: { id: string }, name = `Contact ${uniq()}`) {
	const id = newId();
	await db.insert(giftContact).values({ id, ownerId: owner.id, name });
	return { id, name };
}

export async function createSanta(
	owner: { id: string },
	over: Partial<typeof santa.$inferInsert> = {}
): Promise<typeof santa.$inferSelect> {
	const id = over.id ?? newId();
	await db.insert(santa).values({ id, ownerId: owner.id, name: `Santa ${uniq()}`, joinToken: newToken(), ...over });
	const [s] = await db.select().from(santa).where(eq(santa.id, id));
	return s;
}

/** Add a member with their Santa wish list, as joinSanta would. Returns the list. */
export async function addSantaMember(s: { id: string; name?: string }, who: { id: string }) {
	const l = await createList(who, { title: s.name ?? 'Santa', santaId: s.id });
	await db.insert(santaMember).values({ santaId: s.id, userId: who.id, listId: l.id });
	return l;
}

/** Mark an exchange drawn with the given giver → receiver pairs. */
export async function setDrawn(s: { id: string }, pairs: [giver: { id: string }, receiver: { id: string }][]) {
	for (const [g, r] of pairs) {
		await db
			.update(santaMember)
			.set({ assignedToId: r.id })
			.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, g.id)));
	}
	await db.update(santa).set({ status: 'drawn', drawnAt: new Date() }).where(eq(santa.id, s.id));
}
