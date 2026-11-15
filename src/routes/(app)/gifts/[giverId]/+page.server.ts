import { error } from '@sveltejs/kit';
import { knownPeople } from '#lib/server/lists';
import { giftNoteActions, giftsFrom, revealedGivers } from '#lib/server/gifts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user!;
	const person = (await knownPeople(me.id)).find((p) => p.id === params.giverId);
	if (!person) error(404, "We couldn't find that person.");
	const [revealed, gifts] = await Promise.all([revealedGivers(me.id), giftsFrom(me.id, [person.id])]);
	return { person, received: revealed.includes(person.id), ...gifts };
};

export const actions: Actions = { ...giftNoteActions };
