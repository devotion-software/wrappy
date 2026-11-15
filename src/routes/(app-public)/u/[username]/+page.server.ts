import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { publicListsOf } from '#lib/server/lists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [u] = await db
		.select({ id: user.id, name: user.name, username: user.username })
		.from(user)
		.where(eq(user.username, params.username.toLowerCase()))
		.limit(1);
	if (!u) error(404, 'No one has that username.');
	return { profile: { name: u.name, username: u.username!, isMe: false }, lists: await publicListsOf(u.id), profileUserId: u.id };
};
