import { error, redirect } from '@sveltejs/kit';
import { and, count, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { itemList, list, user } from '#lib/server/db/schema';
import { rememberLinkToken } from '#lib/server/access';
import { isPreviewBot, listMeta } from '#lib/meta';
import type { PageServerLoad } from './$types';

/**
 * Secret share link: remember the token for this browser, then open the list.
 *
 * Link-preview fetchers (WhatsApp, iMessage, Slack…) don't keep cookies across the redirect, so
 * they'd land on a 404 for a private list. They get a small page with the list's preview tags
 * instead. Having the link is what grants access, so this shows them nothing the link doesn't.
 */
export const load: PageServerLoad = async ({ params, cookies, request }) => {
	const [l] = await db
		.select({ id: list.id, shareToken: list.shareToken, title: list.title, eventDate: list.eventDate, ownerName: user.name })
		.from(list)
		.innerJoin(user, eq(user.id, list.ownerId))
		.where(and(eq(list.shareToken, params.token), isNull(list.santaId)))
		.limit(1);
	if (!l) error(404, 'This link has been turned off. Ask the list owner for a new one.');

	if (isPreviewBot(request.headers.get('user-agent'))) {
		const [{ n }] = await db.select({ n: count() }).from(itemList).where(eq(itemList.listId, l.id));
		return { meta: listMeta(l, l.ownerName, n), title: l.title };
	}

	rememberLinkToken(cookies, l.id, params.token);
	redirect(303, `/lists/${l.id}`);
};
