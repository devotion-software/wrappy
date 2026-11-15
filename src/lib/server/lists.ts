import { and, asc, desc, eq, inArray, isNull, max, ne, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
	item,
	itemClaim,
	itemImage,
	itemLink,
	itemList,
	itemSuggestion,
	list,
	listShare,
	listViewer,
	receivedFrom,
	user
} from './db/schema';
import { usersWhoCanSee, type ListRow } from './access';
import { viewClaim, type ClaimView } from './claimView';
import { imageUrl } from '#lib/images';

export interface ListItemView {
	id: string;
	title: string;
	notes: string | null;
	price: string | null;
	currency: string;
	mostWanted: boolean;
	cover: string | null;
	imageCount: number;
	link: { url: string; host: string } | null;
	linkCount: number;
	claim: ClaimView;
	suggestion: { name: string; forViewer: boolean } | null;
}

export function hostOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

/** Items on a list, with claims passed through viewClaim (owner never sees unrevealed claims). */
export async function loadListItems(l: ListRow, viewerId: string | null): Promise<ListItemView[]> {
	const rows = await db
		.select({ item, sortOrder: itemList.sortOrder })
		.from(itemList)
		.innerJoin(item, eq(item.id, itemList.itemId))
		.where(eq(itemList.listId, l.id))
		.orderBy(asc(itemList.sortOrder), asc(itemList.addedAt));
	const ids = rows.map((r) => r.item.id);
	if (!ids.length) return [];

	const [images, links, claims, suggestions, revealed] = await Promise.all([
		db
			.select({ itemId: itemImage.itemId, key: itemImage.storageKey })
			.from(itemImage)
			.where(inArray(itemImage.itemId, ids))
			.orderBy(asc(itemImage.sortOrder), asc(itemImage.createdAt)),
		db
			.select({ itemId: itemLink.itemId, url: itemLink.url })
			.from(itemLink)
			.where(inArray(itemLink.itemId, ids))
			.orderBy(asc(itemLink.sortOrder), asc(itemLink.createdAt)),
		db
			.select({ itemId: itemClaim.itemId, userId: itemClaim.userId, status: itemClaim.status, name: user.name })
			.from(itemClaim)
			.innerJoin(user, eq(user.id, itemClaim.userId))
			.where(inArray(itemClaim.itemId, ids)),
		db
			.select({ itemId: itemSuggestion.itemId, userId: itemSuggestion.userId, name: user.name })
			.from(itemSuggestion)
			.innerJoin(user, eq(user.id, itemSuggestion.userId))
			.where(inArray(itemSuggestion.itemId, ids)),
		viewerId === l.ownerId
			? db.select({ giverId: receivedFrom.giverId }).from(receivedFrom).where(eq(receivedFrom.ownerId, l.ownerId))
			: Promise.resolve([] as { giverId: string }[])
	]);

	const revealedSet = new Set(revealed.map((r) => r.giverId));
	const canSee = viewerId === l.ownerId ? new Set<string>() : await usersWhoCanSee(l, claims.map((c) => c.userId));

	const imgBy = group(images, (i) => i.itemId);
	const linkBy = group(links, (i) => i.itemId);
	const claimBy = new Map(claims.map((c) => [c.itemId, c]));
	const suggBy = new Map(suggestions.map((s) => [s.itemId, s]));

	return rows.map(({ item: it }) => {
		const imgs = imgBy.get(it.id) ?? [];
		const lks = linkBy.get(it.id) ?? [];
		const c = claimBy.get(it.id);
		const s = suggBy.get(it.id);
		return {
			id: it.id,
			title: it.title,
			notes: it.notes,
			price: it.price,
			currency: it.currency,
			mostWanted: it.mostWanted,
			cover: imgs[0] ? imageUrl(imgs[0].key, 'thumb') : null,
			imageCount: imgs.length,
			link: lks[0] ? { url: lks[0].url, host: hostOf(lks[0].url) } : null,
			linkCount: lks.length,
			claim: viewClaim(c, {
				viewerId,
				ownerId: l.ownerId,
				revealedGiverIds: revealedSet,
				claimerCanSeeList: c ? canSee.has(c.userId) : false
			}),
			suggestion: s ? { name: s.name, forViewer: s.userId === viewerId } : null
		};
	});
}

function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
	const m = new Map<string, T[]>();
	for (const r of rows) {
		const k = key(r);
		const arr = m.get(k);
		if (arr) arr.push(r);
		else m.set(k, [r]);
	}
	return m;
}

export interface ListCard {
	id: string;
	title: string;
	eventDate: string | null;
	visibility: 'public' | 'private';
	santaId: string | null;
	count: number;
	preview: string[];
	sharedWith: number;
	ownerName?: string;
}

async function cardsFor(lists: { id: string }[]): Promise<Map<string, { count: number; preview: string[] }>> {
	const ids = lists.map((l) => l.id);
	const out = new Map<string, { count: number; preview: string[] }>();
	if (!ids.length) return out;
	const rows = await db
		.select({ listId: itemList.listId, title: item.title })
		.from(itemList)
		.innerJoin(item, eq(item.id, itemList.itemId))
		.where(inArray(itemList.listId, ids))
		.orderBy(asc(itemList.sortOrder), asc(itemList.addedAt));
	for (const r of rows) {
		const e = out.get(r.listId) ?? { count: 0, preview: [] };
		e.count++;
		if (e.preview.length < 3) e.preview.push(r.title);
		out.set(r.listId, e);
	}
	return out;
}

export async function myLists(userId: string): Promise<ListCard[]> {
	const lists = await db.select().from(list).where(eq(list.ownerId, userId)).orderBy(desc(list.updatedAt));
	const ids = lists.map((l) => l.id);
	const [cards, shares, linkViewers] = await Promise.all([
		cardsFor(lists),
		ids.length
			? db
					.select({ listId: listShare.listId, n: sql<number>`count(*)` })
					.from(listShare)
					.where(inArray(listShare.listId, ids))
					.groupBy(listShare.listId)
			: [],
		ids.length
			? db
					.select({ listId: listViewer.listId, n: sql<number>`count(*)` })
					.from(listViewer)
					.where(and(inArray(listViewer.listId, ids), eq(listViewer.viaLink, true)))
					.groupBy(listViewer.listId)
			: []
	]);
	const shareN = new Map(shares.map((s) => [s.listId, Number(s.n)]));
	const linkN = new Map(linkViewers.map((s) => [s.listId, Number(s.n)]));
	return lists.map((l) => ({
		id: l.id,
		title: l.title,
		eventDate: l.eventDate,
		visibility: l.visibility,
		santaId: l.santaId,
		count: cards.get(l.id)?.count ?? 0,
		preview: cards.get(l.id)?.preview ?? [],
		sharedWith: (shareN.get(l.id) ?? 0) + (l.shareToken ? (linkN.get(l.id) ?? 0) : 0)
	}));
}

/** Other people's lists I've been invited to or have opened (and can still see). Excludes Secret Santa lists. */
export async function friendsLists(userId: string, email: string): Promise<ListCard[]> {
	const rows = await db
		.selectDistinct({ list, ownerName: user.name })
		.from(list)
		.innerJoin(user, eq(user.id, list.ownerId))
		.leftJoin(listShare, and(eq(listShare.listId, list.id), or(eq(listShare.userId, userId), eq(listShare.email, email.toLowerCase()))))
		.leftJoin(listViewer, and(eq(listViewer.listId, list.id), eq(listViewer.userId, userId)))
		.where(
			and(
				ne(list.ownerId, userId),
				isNull(list.santaId),
				or(
					sql`${listShare.id} is not null`,
					and(sql`${listViewer.userId} is not null`, or(eq(list.visibility, 'public'), and(eq(listViewer.viaLink, true), sql`${list.shareToken} is not null`)))
				)
			)
		)
		.orderBy(desc(list.updatedAt));
	const cards = await cardsFor(rows.map((r) => r.list));
	return rows.map(({ list: l, ownerName }) => ({
		id: l.id,
		title: l.title,
		eventDate: l.eventDate,
		visibility: l.visibility,
		santaId: null,
		count: cards.get(l.id)?.count ?? 0,
		preview: cards.get(l.id)?.preview ?? [],
		sharedWith: 0,
		ownerName
	}));
}

export async function publicListsOf(ownerId: string): Promise<ListCard[]> {
	const lists = await db
		.select()
		.from(list)
		.where(and(eq(list.ownerId, ownerId), eq(list.visibility, 'public'), isNull(list.santaId)))
		.orderBy(desc(list.updatedAt));
	const cards = await cardsFor(lists);
	return lists.map((l) => ({
		id: l.id,
		title: l.title,
		eventDate: l.eventDate,
		visibility: l.visibility,
		santaId: null,
		count: cards.get(l.id)?.count ?? 0,
		preview: cards.get(l.id)?.preview ?? [],
		sharedWith: 0
	}));
}

/** Append an item to the end of a list (no-op if it's already there). */
export async function addItemToList(listId: string, itemId: string) {
	const [{ m }] = await db
		.select({ m: max(itemList.sortOrder) })
		.from(itemList)
		.where(eq(itemList.listId, listId));
	await db
		.insert(itemList)
		.values({ listId, itemId, sortOrder: (m ?? 0) + 1 })
		.onDuplicateKeyUpdate({ set: { listId: sql`${itemList.listId}` } });
}

/**
 * People the owner could plausibly have received presents from / suggest as buyers:
 * anyone invited to or who has opened one of their lists, plus fellow Secret Santa members.
 */
export async function knownPeople(ownerId: string): Promise<{ id: string; name: string }[]> {
	const result = await db.execute(sql`
		select distinct u.id, u.name from ${user} u
		where u.id <> ${ownerId} and u.name <> '' and (
			u.id in (select ls.user_id from list_share ls join list l on l.id = ls.list_id where l.owner_id = ${ownerId})
			or u.id in (select lv.user_id from list_viewer lv join list l on l.id = lv.list_id where l.owner_id = ${ownerId})
			or u.id in (select sm2.user_id from santa_member sm1 join santa_member sm2 on sm2.santa_id = sm1.santa_id where sm1.user_id = ${ownerId})
		)
		order by u.name`);
	const rows = (result as unknown as [{ id: string; name: string }[]])[0];
	return rows.map((r) => ({ id: r.id, name: r.name }));
}
