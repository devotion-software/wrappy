import { error } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { receivedFrom } from '#lib/server/db/schema';
import { knownPeople } from '#lib/server/lists';
import { allReceived, contactsOf, giftNoteActions, revealedGivers, thankedPeople, thanksActions } from '#lib/server/gifts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const [people, revealed, contacts, { fromLists, noted }, thanked] = await Promise.all([
		knownPeople(me.id),
		revealedGivers(me.id),
		contactsOf(me.id),
		allReceived(me.id),
		thankedPeople(me.id)
	]);
	return { people, revealed, fromLists, noted, contacts, thanked };
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
	// No "undo": received-from is one-way, or an owner could tick, peek at what was bought, and untick.
	...giftNoteActions,
	...thanksActions
};
