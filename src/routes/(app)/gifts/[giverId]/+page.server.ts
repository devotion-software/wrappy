import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { giftContact } from '#lib/server/db/schema';
import { knownPeople } from '#lib/server/lists';
import { getContact, giftNoteActions, giftsFrom, giftsFromContacts, revealedGivers } from '#lib/server/gifts';
import type { Actions, PageServerLoad } from './$types';

/** One giver's page: an account holder (by user id) or one of your contacts (by contact id). */
export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const person = (await knownPeople(me.id)).find((p) => p.id === params.giverId);
	if (person) {
		const [revealed, gifts] = await Promise.all([revealedGivers(me.id), giftsFrom(me.id, [person.id])]);
		return { person: { ...person, isContact: false }, received: revealed.includes(person.id), ...gifts };
	}
	const contact = await getContact(me.id, params.giverId);
	if (!contact) error(404, "We couldn't find that person.");
	return {
		person: { ...contact, isContact: true },
		received: true,
		fromLists: [],
		noted: await giftsFromContacts(me.id, [contact.id])
	};
};

export const actions: Actions = {
	...giftNoteActions,
	/** Remove a contact and every present noted from them. */
	deleteContact: async ({ locals, params }) => {
		const me = locals.user!;
		await db.delete(giftContact).where(and(eq(giftContact.id, params.giverId), eq(giftContact.ownerId, me.id)));
		redirect(303, '/gifts');
	}
};
