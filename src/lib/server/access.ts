import { and, eq, or, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { Cookies } from '@sveltejs/kit';
import { db } from './db';
import { itemList, list, listShare, listViewer, santa, santaMember } from './db/schema';

export type ListRow = typeof list.$inferSelect;
export interface Viewer {
	id: string;
	email: string;
}

/** Cookie remembering a secret share-link token for a list (so anonymous visitors keep access). */
export const linkCookieName = (listId: string) => `wl_${listId}`;

export function rememberLinkToken(cookies: Cookies, listId: string, token: string) {
	cookies.set(linkCookieName(listId), token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 365
	});
}

/**
 * Can `viewer` see this list? (Does not consider link-token cookies — see getListAccess.)
 * Owner · public lists · email invite · joined via a still-valid secret link ·
 * the Secret Santa giver assigned to this list's owner.
 */
async function hasStandingAccess(l: ListRow, viewer: Viewer): Promise<boolean> {
	if (l.ownerId === viewer.id) return true;
	if (l.santaId) return isAssignedSanta(l, viewer.id);
	if (l.visibility === 'public') return true;

	const [share] = await db
		.select({ id: listShare.id })
		.from(listShare)
		.where(
			and(
				eq(listShare.listId, l.id),
				or(eq(listShare.userId, viewer.id), eq(listShare.email, viewer.email.toLowerCase()))
			)
		)
		.limit(1);
	if (share) return true;

	const [v] = await db
		.select({ viaLink: listViewer.viaLink })
		.from(listViewer)
		.where(and(eq(listViewer.listId, l.id), eq(listViewer.userId, viewer.id)))
		.limit(1);
	return !!v?.viaLink && !!l.shareToken;
}

async function isAssignedSanta(l: ListRow, userId: string): Promise<boolean> {
	const [m] = await db
		.select({ userId: santaMember.userId })
		.from(santaMember)
		.innerJoin(santa, eq(santa.id, santaMember.santaId))
		.where(
			and(
				eq(santaMember.santaId, l.santaId!),
				eq(santaMember.userId, userId),
				eq(santaMember.assignedToId, l.ownerId),
				eq(santa.status, 'drawn')
			)
		)
		.limit(1);
	return !!m;
}

export type ListAccess = { list: ListRow; isOwner: boolean };

/**
 * Resolve access for a page view, honouring a secret-link cookie, and record signed-in
 * guests as viewers (used for "who's opened it", Friends' lists and buyer suggestions).
 * Returns null when the list doesn't exist or the viewer can't see it (callers 404, so
 * private lists don't leak their existence).
 */
export async function getListAccess(
	listId: string,
	viewer: Viewer | null,
	cookies: Cookies
): Promise<ListAccess | null> {
	const [l] = await db.select().from(list).where(eq(list.id, listId)).limit(1);
	if (!l) return null;
	if (viewer && l.ownerId === viewer.id) return { list: l, isOwner: true };

	const cookieToken = cookies.get(linkCookieName(l.id));
	const viaToken = !l.santaId && !!l.shareToken && cookieToken === l.shareToken;

	let ok = viaToken;
	if (!ok && !viewer) ok = l.visibility === 'public' && !l.santaId;
	if (!ok && viewer) ok = await hasStandingAccess(l, viewer);
	if (!ok) return null;

	if (viewer) {
		await db
			.insert(listViewer)
			.values({ listId: l.id, userId: viewer.id, viaLink: viaToken })
			.onDuplicateKeyUpdate({
				set: {
					lastViewedAt: sql`now(3)`,
					viaLink: viaToken ? true : sql`${listViewer.viaLink}`
				}
			});
	}
	return { list: l, isOwner: false };
}

/**
 * Claims that must stay anonymous because they're Secret Santa gifts: the claimer is `ownerId`'s
 * assigned Santa in a drawn exchange, and the item is on `ownerId`'s wish list for that exchange.
 * Naming them on the owner's other lists would tell everyone who drew whom.
 * Returns keys of the form `${itemId}:${userId}`.
 */
export async function santaGiftClaims(ownerId: string, claims: { itemId: string; userId: string }[]): Promise<Set<string>> {
	if (!claims.length) return new Set();
	const giver = alias(santaMember, 'giver');
	const recv = alias(santaMember, 'recv');
	const rows = await db
		.select({ itemId: itemList.itemId, userId: giver.userId })
		.from(giver)
		.innerJoin(santa, and(eq(santa.id, giver.santaId), eq(santa.status, 'drawn')))
		.innerJoin(recv, and(eq(recv.santaId, giver.santaId), eq(recv.userId, giver.assignedToId)))
		.innerJoin(itemList, eq(itemList.listId, recv.listId))
		.where(
			and(
				eq(giver.assignedToId, ownerId),
				inArray(giver.userId, [...new Set(claims.map((c) => c.userId))]),
				inArray(itemList.itemId, [...new Set(claims.map((c) => c.itemId))])
			)
		);
	return new Set(rows.map((r) => `${r.itemId}:${r.userId}`));
}

/** Which of `userIds` can see list `l` (without link cookies). Used to decide whether to name a claimer. */
export async function usersWhoCanSee(l: ListRow, userIds: string[]): Promise<Set<string>> {
	const ids = [...new Set(userIds)];
	const out = new Set<string>();
	if (!ids.length) return out;
	if (ids.includes(l.ownerId)) out.add(l.ownerId);

	if (l.santaId) {
		const rows = await db
			.select({ userId: santaMember.userId })
			.from(santaMember)
			.innerJoin(santa, eq(santa.id, santaMember.santaId))
			.where(
				and(
					eq(santaMember.santaId, l.santaId),
					eq(santaMember.assignedToId, l.ownerId),
					eq(santa.status, 'drawn'),
					inArray(santaMember.userId, ids)
				)
			);
		rows.forEach((r) => out.add(r.userId));
		return out;
	}
	if (l.visibility === 'public') return new Set(ids);

	const shares = await db
		.select({ userId: listShare.userId })
		.from(listShare)
		.where(and(eq(listShare.listId, l.id), inArray(listShare.userId, ids)));
	shares.forEach((r) => r.userId && out.add(r.userId));
	if (l.shareToken) {
		const viewers = await db
			.select({ userId: listViewer.userId })
			.from(listViewer)
			.where(and(eq(listViewer.listId, l.id), eq(listViewer.viaLink, true), inArray(listViewer.userId, ids)));
		viewers.forEach((r) => out.add(r.userId));
	}
	return out;
}
