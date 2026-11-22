import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { privateListsSharedWith, publicListsOf } from '#lib/server/lists';
import { plural } from '#lib/format';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const [u] = await db
		.select({ id: user.id, name: user.name, username: user.username })
		.from(user)
		.where(eq(user.username, params.username.toLowerCase()))
		.limit(1);
	if (!u) error(404, 'No one has that username.');
	const lists = await publicListsOf(u.id);
	// Only for the person viewing; never in the link preview below.
	const sharedLists = locals.user ? await privateListsSharedWith(u.id, locals.user) : [];
	return {
		profile: { name: u.name, username: u.username!, isMe: false },
		lists,
		sharedLists,
		profileUserId: u.id,
		meta: {
			title: `${u.name}'s wish lists`,
			description: lists.length ? `${plural(lists.length, 'wish list')} on Wrappy.` : `${u.name} is on Wrappy.`
		}
	};
};
