import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemImage, itemLink, itemSuggestion, list, santa, user } from '#lib/server/db/schema';
import {
	addLink,
	deleteItem,
	importImages,
	itemDetail,
	listsContaining,
	parseItemForm,
	requireOwnItem,
	santaPriceProblem,
	setItemLists
} from '#lib/server/items';
import { deleteItemImage, reorderImages } from '#lib/server/images';
import { fetchLinkMeta, normaliseUrl } from '#lib/server/linkFetch';
import { knownPeople } from '#lib/server/lists';
import { formatPrice } from '#lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const me = locals.user!;
	const it = await requireOwnItem(me.id, params.id);
	const [{ links, images }, onLists, allLists, people, [suggestion]] = await Promise.all([
		itemDetail(it.id),
		listsContaining(it.id),
		db
			.select({ id: list.id, title: list.title, santaId: list.santaId, limit: santa.priceLimit, currency: santa.currency })
			.from(list)
			.leftJoin(santa, eq(santa.id, list.santaId))
			.where(eq(list.ownerId, me.id))
			.orderBy(asc(list.title)),
		knownPeople(me.id),
		db
			.select({ userId: itemSuggestion.userId, name: user.name })
			.from(itemSuggestion)
			.innerJoin(user, eq(user.id, itemSuggestion.userId))
			.where(eq(itemSuggestion.itemId, it.id))
	]);
	const backList = url.searchParams.get('list');
	return {
		item: it,
		links,
		images,
		onLists: onLists.map((l) => l.id),
		allLists: allLists.map((l) => ({
			id: l.id,
			title: l.title,
			santa: l.santaId ? formatPrice(l.limit, l.currency ?? 'GBP') ?? 'Secret Santa' : null
		})),
		people,
		suggestion: suggestion ?? null,
		back: backList && allLists.some((l) => l.id === backList) ? backList : null
	};
};

/** Every Santa list this item is on (or would be on) must still accept it. */
async function santaProblems(listIds: string[], it: { price: string | null; currency: string }) {
	const problems: string[] = [];
	for (const id of listIds) {
		const p = await santaPriceProblem(id, it);
		if (p) problems.push(p);
	}
	return problems;
}

export const actions: Actions = {
	save: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const parsed = parseItemForm(await request.formData());
		if ('error' in parsed) return fail(400, { saveError: parsed.error });
		const onLists = (await listsContaining(it.id)).map((l) => l.id);
		const problems = await santaProblems(onLists, parsed.input);
		if (problems.length) return fail(400, { saveError: problems[0] });
		await db.update(item).set(parsed.input).where(eq(item.id, it.id));
		return { saved: true };
	},

	lists: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const ids = (await request.formData()).getAll('listId').map(String);
		const current = new Set((await listsContaining(it.id)).map((l) => l.id));
		const problems = await santaProblems(ids.filter((id) => !current.has(id)), it);
		if (problems.length) return fail(400, { listsError: problems[0] });
		await setItemLists(locals.user!.id, it.id, ids);
		return { listsSaved: true };
	},

	addLink: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const raw = String((await request.formData()).get('url') ?? '');
		let url: string;
		try {
			url = normaliseUrl(raw);
		} catch {
			return fail(400, { linkError: "That link doesn't look right. Check it and try again." });
		}
		const linkId = await addLink(it.id, url);
		const meta = await fetchLinkMeta(url);
		return {
			linkFound: {
				linkId,
				images: meta?.images ?? [],
				price: meta?.price ? formatPrice(meta.price, meta.currency ?? it.currency) : null,
				rawPrice: meta?.price ?? null,
				currency: meta?.currency ?? null,
				failed: !meta
			}
		};
	},

	removeLink: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const fd = await request.formData();
		const linkId = String(fd.get('linkId') ?? '');
		if (fd.get('withImages') === 'on') {
			const imgs = await db
				.select({ id: itemImage.id })
				.from(itemImage)
				.where(and(eq(itemImage.itemId, it.id), eq(itemImage.linkId, linkId)));
			for (const img of imgs) await deleteItemImage(it.id, img.id);
		}
		await db.delete(itemLink).where(and(eq(itemLink.id, linkId), eq(itemLink.itemId, it.id)));
		return { linkRemoved: true };
	},

	importImages: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const fd = await request.formData();
		const linkId = String(fd.get('linkId') ?? '') || null;
		const urls = fd.getAll('image').map(String).filter(Boolean);
		const saved = await importImages(it.id, urls, linkId);
		return { imported: saved, wanted: urls.length };
	},

	usePrice: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const fd = await request.formData();
		const price = String(fd.get('price') ?? '');
		const currency = String(fd.get('currency') ?? it.currency);
		if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^[A-Z]{3}$/.test(currency)) return fail(400, {});
		const problems = await santaProblems((await listsContaining(it.id)).map((l) => l.id), { price, currency });
		if (problems.length) return fail(400, { saveError: problems[0] });
		await db.update(item).set({ price, currency }).where(eq(item.id, it.id));
		return { saved: true };
	},

	imageCover: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		const imageId = String((await request.formData()).get('imageId') ?? '');
		const ids = (await itemDetail(it.id)).images.map((i) => i.id);
		await reorderImages(it.id, [imageId, ...ids.filter((id) => id !== imageId)]);
		return { imagesChanged: true };
	},

	imageOrder: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		let ids: string[] = [];
		try {
			ids = JSON.parse(String((await request.formData()).get('order') ?? '[]'));
		} catch {
			return fail(400, {});
		}
		await reorderImages(it.id, ids.filter((x) => typeof x === 'string'));
		return { imagesChanged: true };
	},

	imageDelete: async ({ params, locals, request }) => {
		const it = await requireOwnItem(locals.user!.id, params.id);
		await deleteItemImage(it.id, String((await request.formData()).get('imageId') ?? ''));
		return { imagesChanged: true };
	},

	suggest: async ({ params, locals, request }) => {
		const me = locals.user!;
		const it = await requireOwnItem(me.id, params.id);
		const userId = String((await request.formData()).get('userId') ?? '');
		if (!userId) {
			await db.delete(itemSuggestion).where(eq(itemSuggestion.itemId, it.id));
			return { suggested: true };
		}
		const people = await knownPeople(me.id);
		if (!people.some((p) => p.id === userId)) error(400, 'Pick someone from the list.');
		await db.insert(itemSuggestion).values({ itemId: it.id, userId }).onDuplicateKeyUpdate({ set: { userId } });
		return { suggested: true };
	},

	delete: async ({ params, locals, url }) => {
		await deleteItem(locals.user!.id, params.id);
		const back = url.searchParams.get('list');
		if (back) {
			const [l] = await db
				.select({ id: list.id })
				.from(list)
				.where(and(eq(list.id, back), eq(list.ownerId, locals.user!.id)));
			if (l) redirect(303, `/lists/${l.id}`);
		}
		redirect(303, '/items');
	}
};
