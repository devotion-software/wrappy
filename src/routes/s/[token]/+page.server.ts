import { error, redirect } from '@sveltejs/kit';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { rememberLinkToken } from '#lib/server/access';
import type { PageServerLoad } from './$types';

/** Secret share link: remember the token for this browser, then open the list. */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const [l] = await db
		.select({ id: list.id, shareToken: list.shareToken })
		.from(list)
		.where(and(eq(list.shareToken, params.token), isNull(list.santaId)))
		.limit(1);
	if (!l) error(404, 'This link has been turned off. Ask the list owner for a new one.');
	rememberLinkToken(cookies, l.id, params.token);
	redirect(303, `/lists/${l.id}`);
};
