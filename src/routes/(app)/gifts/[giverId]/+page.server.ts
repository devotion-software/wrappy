import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { giftContact, giftThanks } from '#lib/server/db/schema';
import { knownPeople } from '#lib/server/lists';
import { allReceived, getContact, giftNoteActions, giverOptions, revealedGivers, thankedPeople, thanksActions } from '#lib/server/gifts';
import type { Actions, PageServerLoad } from './$types';

/** One giver's page: an account holder (by user id) or one of your contacts (by contact id). */
export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const account = (await knownPeople(me.id)).find((p) => p.id === params.giverId);
	const contact = account ? null : await getContact(me.id, params.giverId);
	if (!account && !contact) error(404, "We couldn't find that person.");
	const person = account ? { ...account, isContact: false } : { ...contact!, isContact: true };

	const [revealed, all, options, thanked] = await Promise.all([
		revealedGivers(me.id),
		allReceived(me.id),
		giverOptions(me.id),
		thankedPeople(me.id)
	]);
	return {
		person,
		received: person.isContact || revealed.includes(person.id),
		thanked: thanked.includes(person.id),
		fromLists: all.fromLists.filter((g) => g.giverId === person.id),
		noted: all.noted.filter((g) => g.giverId === person.id),
		// Who else a present could be from (for "From someone else?").
		others: options.filter((o) => o.id !== person.id)
	};
};

export const actions: Actions = {
	...giftNoteActions,
	...thanksActions,
	/** Remove a contact and every present noted from them. */
	deleteContact: async ({ locals, params }) => {
		const me = locals.user!;
		await db.delete(giftContact).where(and(eq(giftContact.id, params.giverId), eq(giftContact.ownerId, me.id)));
		await db.delete(giftThanks).where(and(eq(giftThanks.personId, params.giverId), eq(giftThanks.ownerId, me.id)));
		redirect(303, '/gifts');
	}
};
