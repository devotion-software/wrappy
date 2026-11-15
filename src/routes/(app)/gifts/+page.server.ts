import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemClaim, receivedFrom, user } from '#lib/server/db/schema';
import { knownPeople } from '#lib/server/lists';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const [people, received] = await Promise.all([
		knownPeople(me.id),
		db.select({ giverId: receivedFrom.giverId }).from(receivedFrom).where(eq(receivedFrom.ownerId, me.id))
	]);
	const revealed = received.map((r) => r.giverId);
	// Only BOUGHT claims by givers the owner has marked received from. "Buying" stays hidden.
	const gifts = revealed.length
		? await db
				.select({ itemId: item.id, title: item.title, giverId: itemClaim.userId, giverName: user.name })
				.from(itemClaim)
				.innerJoin(item, eq(item.id, itemClaim.itemId))
				.innerJoin(user, eq(user.id, itemClaim.userId))
				.where(and(eq(item.ownerId, me.id), eq(itemClaim.status, 'bought'), inArray(itemClaim.userId, revealed)))
				.orderBy(asc(user.name), asc(item.title))
		: [];
	return { people, revealed, gifts };
};

export const actions: Actions = {
	received: async ({ locals, request }) => {
		const me = locals.user!;
		const giverId = String((await request.formData()).get('giverId') ?? '');
		if (!(await knownPeople(me.id)).some((p) => p.id === giverId)) error(400, 'Pick someone from the list.');
		await db.insert(receivedFrom).values({ ownerId: me.id, giverId }).onDuplicateKeyUpdate({ set: { giverId } });
		return { done: true };
	},
	receivedAll: async ({ locals }) => {
		const me = locals.user!;
		const people = await knownPeople(me.id);
		if (people.length) {
			await db
				.insert(receivedFrom)
				.values(people.map((p) => ({ ownerId: me.id, giverId: p.id })))
				.onDuplicateKeyUpdate({ set: { giverId: sql`${receivedFrom.giverId}` } });
		}
		return { done: true };
	},
	undo: async ({ locals, request }) => {
		const me = locals.user!;
		const giverId = String((await request.formData()).get('giverId') ?? '');
		await db.delete(receivedFrom).where(and(eq(receivedFrom.ownerId, me.id), eq(receivedFrom.giverId, giverId)));
		return { done: true };
	}
};
