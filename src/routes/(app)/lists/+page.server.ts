import { friendsLists, myLists } from '#lib/server/lists';
import { mySantas } from '#lib/server/santa';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user!;
	const [mine, friends, santas] = await Promise.all([myLists(me.id), friendsLists(me.id, me.email), mySantas(me.id)]);
	return {
		// Secret Santa wish lists are managed from the Secret Santa page.
		mine: mine.filter((l) => !l.santaId),
		friends,
		santas
	};
};
