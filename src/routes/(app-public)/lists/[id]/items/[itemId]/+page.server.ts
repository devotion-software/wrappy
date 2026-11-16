import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { getListAccess } from '#lib/server/access';
import { loadListItems } from '#lib/server/lists';
import { itemDetail } from '#lib/server/items';
import { claimActions } from '#lib/server/claims';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const viewer = locals.user ? { id: locals.user.id, email: locals.user.email } : null;
	const access = await getListAccess(params.id, viewer, cookies);
	if (!access) error(404, "This list doesn't exist, or it hasn't been shared with you.");
	if (access.isOwner) redirect(303, `/items/${params.itemId}?list=${params.id}`);

	const view = (await loadListItems(access.list, viewer?.id ?? null)).find((i) => i.id === params.itemId);
	if (!view) error(404, 'This item is no longer on the list.');
	const [{ links, images }, [owner]] = await Promise.all([
		itemDetail(view.id),
		db.select({ name: user.name }).from(user).where(eq(user.id, access.list.ownerId))
	]);
	return {
		list: { id: access.list.id, title: access.list.title },
		ownerName: owner.name,
		item: view,
		links: links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
		images: images.map((i) => ({ id: i.id, storageKey: i.storageKey, alt: i.alt }))
	};
};

export const actions: Actions = { ...claimActions };
