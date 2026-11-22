import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { friendGroup, item, itemList, list, listShare, listViewer, santa, user } from '#lib/server/db/schema';
import { myGroups, shareListWithGroup } from '#lib/server/groups';
import { getListAccess, signInOr404 } from '#lib/server/access';
import { loadListItems, addItemToList, hostOf } from '#lib/server/lists';
import { newId, newToken } from '#lib/server/ids';
import { parseListForm } from '#lib/server/listForm';
import { createItem, importImages, importPastedList, parseItemForm, santaPriceProblem } from '#lib/server/items';
import { fetchLinkMeta, looksLikeUrl, normaliseUrl } from '#lib/server/linkFetch';
import { sendListInviteEmail } from '#lib/server/email';
import { claimActions } from '#lib/server/claims';
import { guestChoices, listOccasions, occasionActions, occasionNames } from '#lib/server/occasions';
import { extraActions, loadExtras } from '#lib/server/extras';
import { FETCH_LIMIT_MESSAGE, takeFetchBudget } from '#lib/server/rateLimit';
import { formatPrice, toCurrency } from '#lib/format';
import { listMeta } from '#lib/meta';
import { isoDay } from '#lib/server/reminders';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

const viewerOf = (locals: App.Locals) => (locals.user ? { id: locals.user.id, email: locals.user.email } : null);

export const load: PageServerLoad = async ({ params, locals, cookies, url }) => {
	const access = await getListAccess(params.id, viewerOf(locals), cookies);
	if (!access) return signInOr404(params.id, viewerOf(locals), url);
	const l = access.list;
	const viewerId = locals.user?.id ?? null;

	const [[owner], items, santaRow, occasions, extras] = await Promise.all([
		db.select({ id: user.id, name: user.name, username: user.username }).from(user).where(eq(user.id, l.ownerId)),
		loadListItems(l, viewerId),
		l.santaId
			? db.select().from(santa).where(eq(santa.id, l.santaId)).then((r) => r[0] ?? null)
			: Promise.resolve(null),
		l.santaId ? Promise.resolve([]) : listOccasions(l.id),
		loadExtras(l, viewerId)
	]);

	// Names for every occasion a guest might see mentioned (an item can carry another list's occasion).
	const names = access.isOwner
		? new Map<string, string>()
		: await occasionNames([
				...items.flatMap((i) => [i.claims.mine?.occasionId, ...i.claims.others.map((o) => o.occasionId)]),
				...extras.map((e) => e.occasionId)
			]);

	const base = {
		list: {
			id: l.id,
			title: l.title,
			description: l.description,
			eventDate: l.eventDate,
			visibility: l.visibility,
			santaId: l.santaId,
			archived: !!l.archivedAt,
			// The event date has been and gone (dates are stored as UTC days).
			isPast: !!l.eventDate && l.eventDate < isoDay(new Date())
		},
		owner: { id: owner.id, name: owner.name, username: owner.username },
		items,
		isOwner: access.isOwner,
		occasions,
		suggestedOccasion: guestChoices(occasions, isoDay(new Date())).suggested,
		occasionNames: Object.fromEntries(names),
		extras,
		santa: santaRow
			? { id: santaRow.id, name: santaRow.name, limit: formatPrice(santaRow.priceLimit, santaRow.currency) }
			: null,
		meta: listMeta(l, owner.name, items.length)
	};

	if (!access.isOwner) return { ...base, owned: null };

	const onList = items.map((i) => i.id);
	const [shareRows, viewers, library, groups] = await Promise.all([
		db
			.select({ id: listShare.id, email: listShare.email, name: user.name, groupId: listShare.groupId, groupName: friendGroup.name })
			.from(listShare)
			.leftJoin(user, eq(user.id, listShare.userId))
			.leftJoin(friendGroup, eq(friendGroup.id, listShare.groupId))
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
			.orderBy(asc(item.title)),
		l.santaId ? [] : myGroups(l.ownerId)
	]);
	// People invited through a group: the owner didn't type their address, so it isn't sent.
	const shares = shareRows.map((r) => ({
		id: r.id,
		email: r.groupId && r.name ? null : r.email,
		name: r.name,
		groupName: r.groupId ? r.groupName : null
	}));

	return {
		...base,
		owned: {
			shareToken: l.shareToken,
			shares,
			viewers,
			library,
			groups: groups.map((g) => ({ id: g.id, name: g.name, members: g.members })),
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
		if (!text) return fail(400, { addError: 'Write an item or paste a shop link.' });

		if (looksLikeUrl(text)) {
			let url: string;
			try {
				url = normaliseUrl(text);
			} catch {
				return fail(400, { addError: "That link doesn't look right. Check it and try again." });
			}
			if (!(await takeFetchBudget(me.id))) return fail(429, { addError: FETCH_LIMIT_MESSAGE });
			const meta = await fetchLinkMeta(url);
			if (!meta) return fail(422, { manualUrl: url });

			const input = {
				title: meta.title ?? hostOf(url),
				notes: meta.description,
				price: meta.price,
				currency: toCurrency(meta.currency, me.currency),
				mostWanted: false
			};
			if (l.santaId) {
				const problem = await santaPriceProblem(l.id, input);
				if (problem) return fail(400, { addError: problem });
			}
			const { itemId, linkId } = await createItem(me.id, input, { listIds: [l.id], linkUrl: url });
			return { found: { itemId, linkId, title: input.title, price: formatPrice(input.price, input.currency), images: meta.images } };
		}

		if (text.length > 200) return fail(400, { addError: 'Keep the item under 200 characters.' });
		await createItem(me.id, { title: text, notes: null, price: null, currency: toCurrency(me.currency), mostWanted: false }, { listIds: [l.id] });
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

	/** Paste a list from a note: one wish per line. */
	importList: async (event) => {
		const { me, l } = await ownerList(event);
		const text = String((await event.request.formData()).get('list') ?? '');
		const res = await importPastedList(me.id, text, l.id, toCurrency(me.currency));
		if ('error' in res) return fail(400, { importError: res.error });
		return { pasted: res };
	},

	importImages: async (event) => {
		const { me } = await ownerList(event);
		const fd = await event.request.formData();
		const itemId = String(fd.get('itemId') ?? '');
		const linkId = String(fd.get('linkId') ?? '') || null;
		const [it] = await db.select({ id: item.id }).from(item).where(and(eq(item.id, itemId), eq(item.ownerId, me.id)));
		if (!it) error(404, 'Item not found');
		const urls = fd.getAll('image').map(String).filter(Boolean).slice(0, 10);
		if (!(await takeFetchBudget(me.id, urls.length))) return fail(429, { addError: FETCH_LIMIT_MESSAGE });
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
		let input = l.santaId ? { ...parsed.input, visibility: 'private' as const } : parsed.input;
		// With occasions, the list's date follows the last one (see occasions.syncEventDate).
		if ((await listOccasions(l.id)).length) input = { ...input, eventDate: l.eventDate };
		await db.update(list).set(input).where(eq(list.id, l.id));
		return { saved: true };
	},

	/** Archived lists leave the owner's lists page, their profile and friends' lists. Items stay. */
	archive: async (event) => {
		const { l } = await ownerList(event);
		if (l.santaId) return fail(400, { settingsError: 'Secret Santa lists are tidied up with their exchange.' });
		await db.update(list).set({ archivedAt: new Date() }).where(eq(list.id, l.id));
		return { archived: true };
	},

	unarchive: async (event) => {
		const { l } = await ownerList(event);
		await db.update(list).set({ archivedAt: null }).where(eq(list.id, l.id));
		return { unarchived: true };
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
		// Already invited: nothing to do, and don't email them again.
		const [already] = await db
			.select({ id: listShare.id })
			.from(listShare)
			.where(and(eq(listShare.listId, l.id), eq(listShare.email, email)))
			.limit(1);
		if (already) return { shared: email };
		const [existingUser] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
		const shareId = newId();
		const inserted = await db
			.insert(listShare)
			.values({ id: shareId, listId: l.id, email, userId: existingUser?.id ?? null })
			.onDuplicateKeyUpdate({ set: { email } });
		// affectedRows can't tell a new row from an existing one (the driver reports found rows),
		// so this is only a guard against a simultaneous duplicate invite.
		if ((inserted[0] as { affectedRows?: number }).affectedRows === 1) {
			await sendListInviteEmail({
				email,
				ownerName: me.name,
				listTitle: l.title,
				// ?invite lets the sign-in page fill in their email if they're signed out (see signInOr404).
				url: `${event.url.origin}/lists/${l.id}?invite=${shareId}`
			}).catch(() => {});
		}
		return { shared: email };
	},

	/** Invite everyone in one of my groups. */
	shareGroup: async (event) => {
		const { me, l } = await ownerList(event);
		if (l.santaId) return fail(400, { shareError: 'Secret Santa lists are only shown to your Santa.' });
		const groupId = String((await event.request.formData()).get('groupId') ?? '');
		if (!groupId) return fail(400, { shareError: 'Pick a group.' });
		const added = await shareListWithGroup(l, me, groupId, event.url.origin);
		return { sharedGroup: added };
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

	// ── Owner: occasions ──────────────────────────────────────────────────────
	...occasionActions,

	// ── Guests: claiming, and presents that aren't on the list ────────────────
	...claimActions,
	...extraActions
};
