import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemList, list, listShare, listViewer, santa, user } from '#lib/server/db/schema';
import { getListAccess } from '#lib/server/access';
import { loadListItems, addItemToList, hostOf } from '#lib/server/lists';
import { newId, newToken } from '#lib/server/ids';
import { parseListForm } from '#lib/server/listForm';
import { createItem, importImages, parseItemForm, santaPriceProblem } from '#lib/server/items';
import { fetchLinkMeta, looksLikeUrl, normaliseUrl } from '#lib/server/linkFetch';
import { sendListInviteEmail } from '#lib/server/email';
import { claimActions } from '#lib/server/claims';
import { FETCH_LIMIT_MESSAGE, takeFetchBudget } from '#lib/server/rateLimit';
import { formatPrice } from '#lib/format';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const viewerOf = (locals: App.Locals) => (locals.user ? { id: locals.user.id, email: locals.user.email } : null);

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const access = await getListAccess(params.id, viewerOf(locals), cookies);
	if (!access) error(404, "This list doesn't exist, or it hasn't been shared with you.");
	const l = access.list;
	const viewerId = locals.user?.id ?? null;

	const [[owner], items, santaRow] = await Promise.all([
		db.select({ id: user.id, name: user.name, username: user.username }).from(user).where(eq(user.id, l.ownerId)),
		loadListItems(l, viewerId),
		l.santaId
			? db.select().from(santa).where(eq(santa.id, l.santaId)).then((r) => r[0] ?? null)
			: Promise.resolve(null)
	]);

	const base = {
		list: {
			id: l.id,
			title: l.title,
			description: l.description,
			eventDate: l.eventDate,
			visibility: l.visibility,
			santaId: l.santaId
		},
		owner: { id: owner.id, name: owner.name, username: owner.username },
		items,
		isOwner: access.isOwner,
		santa: santaRow
			? { id: santaRow.id, name: santaRow.name, limit: formatPrice(santaRow.priceLimit, santaRow.currency) }
			: null
	};

	if (!access.isOwner) return { ...base, owned: null };

	const onList = items.map((i) => i.id);
	const [shares, viewers, library] = await Promise.all([
		db
			.select({ id: listShare.id, email: listShare.email, name: user.name })
			.from(listShare)
			.leftJoin(user, eq(user.id, listShare.userId))
			.where(eq(listShare.listId, l.id))
			.orderBy(asc(listShare.createdAt)),
		db
			.select({ id: user.id, name: user.name })
			.from(listViewer)
			.innerJoin(user, eq(user.id, listViewer.userId))
			.where(eq(listViewer.listId, l.id))
			.orderBy(desc(listViewer.lastViewedAt)),
		db
			.select({ id: item.id, title: item.title, price: item.price, currency: item.currency })
			.from(item)
			.where(onList.length ? and(eq(item.ownerId, l.ownerId), notInArray(item.id, onList)) : eq(item.ownerId, l.ownerId))
			.orderBy(asc(item.title))
	]);

	return {
		...base,
		owned: {
			shareToken: l.shareToken,
			shares,
			viewers,
			library,
			hasUsername: !!owner.username
		}
	};
};

async function ownerList(event: RequestEvent) {
	const me = event.locals.user;
	if (!me) error(401, 'Log in first');
	const [l] = await db
		.select()
		.from(list)
		.where(and(eq(list.id, event.params.id), eq(list.ownerId, me.id)))
		.limit(1);
	if (!l) error(404, 'List not found');
	return { me, l };
}

export const actions: Actions = {
	// ── Owner: adding wishes ──────────────────────────────────────────────────
	addWish: async (event) => {
		const { me, l } = await ownerList(event);
		const text = String((await event.request.formData()).get('wish') ?? '').trim();
		if (!text) return fail(400, { addError: 'Write a wish or paste a shop link.' });

		if (looksLikeUrl(text)) {
			let url: string;
			try {
				url = normaliseUrl(text);
			} catch {
				return fail(400, { addError: "That link doesn't look right. Check it and try again." });
			}
			if (!takeFetchBudget(me.id)) return fail(429, { addError: FETCH_LIMIT_MESSAGE });
			const meta = await fetchLinkMeta(url);
			if (!meta) return fail(422, { manualUrl: url });

			const input = {
				title: meta.title ?? hostOf(url),
				notes: meta.description,
				price: meta.price,
				currency: meta.currency ?? 'GBP',
				mostWanted: false
			};
			if (l.santaId) {
				const problem = await santaPriceProblem(l.id, input);
				if (problem) return fail(400, { addError: problem });
			}
			const { itemId, linkId } = await createItem(me.id, input, { listIds: [l.id], linkUrl: url });
			return { found: { itemId, linkId, title: input.title, price: formatPrice(input.price, input.currency), images: meta.images } };
		}

		if (text.length > 200) return fail(400, { addError: 'Keep the wish under 200 characters.' });
		await createItem(me.id, { title: text, notes: null, price: null, currency: 'GBP', mostWanted: false }, { listIds: [l.id] });
		return { added: true };
	},

	/** Link couldn't be read: the owner enters the details themselves. */
	addManual: async (event) => {
		const { me, l } = await ownerList(event);
		const fd = await event.request.formData();
		const parsed = parseItemForm(fd);
		let url: string | null = null;
		try {
			url = fd.get('url') ? normaliseUrl(String(fd.get('url'))) : null;
		} catch {
			url = null;
		}
		if ('error' in parsed) return fail(400, { manualUrl: url, manualError: parsed.error });
		if (l.santaId) {
			const problem = await santaPriceProblem(l.id, parsed.input);
			if (problem) return fail(400, { manualUrl: url, manualError: problem });
		}
		await createItem(me.id, parsed.input, { listIds: [l.id], linkUrl: url });
		return { added: true };
	},

	importImages: async (event) => {
		const { me } = await ownerList(event);
		const fd = await event.request.formData();
		const itemId = String(fd.get('itemId') ?? '');
		const linkId = String(fd.get('linkId') ?? '') || null;
		const [it] = await db.select({ id: item.id }).from(item).where(and(eq(item.id, itemId), eq(item.ownerId, me.id)));
		if (!it) error(404, 'Item not found');
		const urls = fd.getAll('image').map(String).filter(Boolean).slice(0, 10);
		if (!takeFetchBudget(me.id, urls.length)) return fail(429, { addError: FETCH_LIMIT_MESSAGE });
		const saved = await importImages(itemId, urls, linkId);
		return { imported: saved, wanted: urls.length };
	},

	addExisting: async (event) => {
		const { me, l } = await ownerList(event);
		const ids = (await event.request.formData()).getAll('itemId').map(String);
		const mine = ids.length
			? await db.select().from(item).where(and(eq(item.ownerId, me.id), inArray(item.id, ids)))
			: [];
		const problems: string[] = [];
		for (const it of mine) {
			const problem = l.santaId ? await santaPriceProblem(l.id, it) : null;
			if (problem) problems.push(`${it.title}: ${problem}`);
			else await addItemToList(l.id, it.id);
		}
		if (problems.length) return fail(400, { addError: problems.join(' ') });
		return { added: true };
	},

	remove: async (event) => {
		const { l } = await ownerList(event);
		const itemId = String((await event.request.formData()).get('itemId') ?? '');
		await db.delete(itemList).where(and(eq(itemList.listId, l.id), eq(itemList.itemId, itemId)));
		return { removed: true };
	},

	reorder: async (event) => {
		const { l } = await ownerList(event);
		let ids: string[] = [];
		try {
			ids = JSON.parse(String((await event.request.formData()).get('order') ?? '[]'));
		} catch {
			return fail(400, {});
		}
		await db.transaction(async (tx) => {
			for (const [i, id] of ids.entries()) {
				if (typeof id !== 'string') continue;
				await tx
					.update(itemList)
					.set({ sortOrder: i + 1 })
					.where(and(eq(itemList.listId, l.id), eq(itemList.itemId, id)));
			}
		});
		return { reordered: true };
	},

	// ── Owner: list settings & sharing ────────────────────────────────────────
	settings: async (event) => {
		const { l } = await ownerList(event);
		const parsed = parseListForm(await event.request.formData());
		if ('error' in parsed) return fail(400, { settingsError: parsed.error });
		const input = l.santaId ? { ...parsed.input, visibility: 'private' as const } : parsed.input;
		await db.update(list).set(input).where(eq(list.id, l.id));
		return { saved: true };
	},

	deleteList: async (event) => {
		const { l } = await ownerList(event);
		if (l.santaId) return fail(400, { settingsError: 'Leave the Secret Santa to remove this list.' });
		await db.delete(list).where(eq(list.id, l.id));
		redirect(303, '/lists');
	},

	share: async (event) => {
		const { me, l } = await ownerList(event);
		if (l.santaId) return fail(400, { shareError: 'Secret Santa lists are only shown to your Santa.' });
		const email = String((await event.request.formData()).get('email') ?? '')
			.trim()
			.toLowerCase();
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, { shareError: 'Enter a full email address.' });
		if (email === me.email.toLowerCase()) return fail(400, { shareError: "That's your own email." });
		const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
		const inserted = await db
			.insert(listShare)
			.values({ id: newId(), listId: l.id, email, userId: existingUser?.id ?? null })
			.onDuplicateKeyUpdate({ set: { email } });
		if ((inserted[0] as { affectedRows?: number }).affectedRows === 1) {
			await sendListInviteEmail({
				email,
				ownerName: me.name,
				listTitle: l.title,
				url: `${event.url.origin}/lists/${l.id}`
			}).catch(() => {});
		}
		return { shared: email };
	},

	unshare: async (event) => {
		const { l } = await ownerList(event);
		const id = String((await event.request.formData()).get('shareId') ?? '');
		await db.delete(listShare).where(and(eq(listShare.id, id), eq(listShare.listId, l.id)));
		return { unshared: true };
	},

	/** Create, or replace, the secret link. Replacing revokes everyone who joined via the old one. */
	newLink: async (event) => {
		const { l } = await ownerList(event);
		if (l.santaId) return fail(400, { shareError: 'Secret Santa lists are only shown to your Santa.' });
		await db.transaction(async (tx) => {
			await tx.update(list).set({ shareToken: newToken() }).where(eq(list.id, l.id));
			if (l.shareToken) {
				await tx.update(listViewer).set({ viaLink: false }).where(eq(listViewer.listId, l.id));
			}
		});
		return { linkChanged: true };
	},

	disableLink: async (event) => {
		const { l } = await ownerList(event);
		await db.transaction(async (tx) => {
			await tx.update(list).set({ shareToken: null }).where(eq(list.id, l.id));
			await tx.update(listViewer).set({ viaLink: false }).where(eq(listViewer.listId, l.id));
		});
		return { linkChanged: true };
	},

	// ── Guests: claiming ──────────────────────────────────────────────────────
	...claimActions
};
