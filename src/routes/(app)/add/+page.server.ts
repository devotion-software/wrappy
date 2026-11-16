import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { createItem, importImages } from '#lib/server/items';
import { fetchLinkMeta, readShared } from '#lib/server/linkFetch';
import { hostOf } from '#lib/server/lists';
import { FETCH_LIMIT_MESSAGE, takeFetchBudget } from '#lib/server/rateLimit';
import { toCurrency } from '#lib/format';
import type { Actions, PageServerLoad } from './$types';

/**
 * "Add from anywhere": the bookmarklet and the phone's share sheet (the PWA share_target) open
 * /add?url=…&title=…&text=…. The owner picks a list, then we read the shop page like a pasted link.
 */

/** The owner's own everyday lists (not Secret Santa or archived ones) to add to. */
const listsOf = (userId: string) =>
	db
		.select({ id: list.id, title: list.title })
		.from(list)
		.where(and(eq(list.ownerId, userId), isNull(list.santaId), isNull(list.archivedAt)))
		.orderBy(asc(list.title));

export const load: PageServerLoad = async ({ locals, url }) => {
	const p = url.searchParams;
	return {
		shared: readShared({ url: p.get('url'), title: p.get('title'), text: p.get('text') }),
		lists: await listsOf(locals.user!.id)
	};
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const me = locals.user!;
		const fd = await request.formData();
		const shared = readShared({ url: String(fd.get('url') ?? ''), title: String(fd.get('title') ?? '') });
		if (!shared) return fail(400, { error: 'There was nothing to add. Share a page or a link to Wrappy.' });

		const listId = String(fd.get('listId') ?? '');
		let listIds: string[] = [];
		if (listId) {
			const mine = await listsOf(me.id);
			if (!mine.some((l) => l.id === listId)) error(404, 'List not found');
			listIds = [listId];
		}

		const currency = toCurrency(me.currency);
		if (!shared.url) {
			const { itemId } = await createItem(me.id, { title: shared.title!, notes: null, price: null, currency, mostWanted: false }, { listIds });
			redirect(303, `/items/${itemId}${listId ? `?list=${listId}` : ''}`);
		}

		if (!(await takeFetchBudget(me.id))) return fail(429, { error: FETCH_LIMIT_MESSAGE });
		const meta = await fetchLinkMeta(shared.url);
		const { itemId, linkId } = await createItem(
			me.id,
			{
				title: (meta?.title ?? shared.title ?? hostOf(shared.url)).slice(0, 200),
				notes: meta?.description ?? null,
				price: meta?.price ?? null,
				currency: toCurrency(meta?.currency, currency),
				mostWanted: false
			},
			{ listIds, linkUrl: shared.url }
		);
		// Keep the shop's main picture, as the list page does by default. More can be picked on the item page.
		const cover = meta?.images[0];
		if (cover && linkId && (await takeFetchBudget(me.id))) await importImages(itemId, [cover], linkId);
		redirect(303, `/items/${itemId}${listId ? `?list=${listId}` : ''}`);
	}
};
