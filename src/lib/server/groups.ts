import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { friendGroup, friendGroupMember, listShare, user } from './db/schema';
import { newId, newToken } from './ids';
import { sendListInviteEmail } from './email';
import type { ListRow } from './access';

/**
 * Groups: people who share lists with each other often (family, the school mums). Anyone in a
 * group can invite people; its owner can also rename it, remove people, reset its link and delete
 * it. Members only ever see each other's names, never email addresses.
 */
export type GroupRow = typeof friendGroup.$inferSelect;

export const MAX_GROUP_MEMBERS = 100;

export function parseGroupName(raw: FormDataEntryValue | null): { name: string } | { error: string } {
	const name = String(raw ?? '').trim();
	if (!name) return { error: 'Give the group a name, like Family.' };
	if (name.length > 80) return { error: 'Keep the name under 80 characters.' };
	return { name };
}

export async function createGroup(ownerId: string, name: string): Promise<string> {
	const id = newId();
	await db.transaction(async (tx) => {
		await tx.insert(friendGroup).values({ id, ownerId, name, joinToken: newToken() });
		await tx.insert(friendGroupMember).values({ groupId: id, userId: ownerId });
	});
	return id;
}

/** Groups I'm in, by name, with how many people are in each. */
export async function myGroups(userId: string): Promise<{ id: string; name: string; members: number; isOwner: boolean }[]> {
	const mine = db.select({ groupId: friendGroupMember.groupId }).from(friendGroupMember).where(eq(friendGroupMember.userId, userId));
	const rows = await db
		.select({ id: friendGroup.id, name: friendGroup.name, ownerId: friendGroup.ownerId, members: sql<number>`count(*)` })
		.from(friendGroup)
		.innerJoin(friendGroupMember, eq(friendGroupMember.groupId, friendGroup.id))
		.where(inArray(friendGroup.id, mine))
		.groupBy(friendGroup.id, friendGroup.name, friendGroup.ownerId)
		.orderBy(asc(friendGroup.name));
	return rows.map((r) => ({ id: r.id, name: r.name, members: Number(r.members), isOwner: r.ownerId === userId }));
}

export async function getGroupByToken(token: string): Promise<GroupRow | null> {
	const [g] = await db.select().from(friendGroup).where(eq(friendGroup.joinToken, token)).limit(1);
	return g ?? null;
}

export async function isMember(groupId: string, userId: string): Promise<boolean> {
	const [m] = await db
		.select({ userId: friendGroupMember.userId })
		.from(friendGroupMember)
		.where(and(eq(friendGroupMember.groupId, groupId), eq(friendGroupMember.userId, userId)))
		.limit(1);
	return !!m;
}

/** The group, if `userId` is in it. Everyone else gets a 404, so groups don't leak. */
export async function groupForMember(groupId: string, userId: string): Promise<GroupRow> {
	const [g] = await db.select().from(friendGroup).where(eq(friendGroup.id, groupId)).limit(1);
	if (!g || !(await isMember(g.id, userId))) error(404, "This group doesn't exist, or you're not in it.");
	return g;
}

/** Names (and usernames) only: members never see each other's email addresses. */
export async function groupMembers(groupId: string) {
	return db
		.select({ id: user.id, name: user.name, username: user.username, joinedAt: friendGroupMember.joinedAt })
		.from(friendGroupMember)
		.innerJoin(user, eq(user.id, friendGroupMember.userId))
		.where(eq(friendGroupMember.groupId, groupId))
		.orderBy(asc(friendGroupMember.joinedAt), asc(user.name));
}

async function memberCount(groupId: string): Promise<number> {
	const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(friendGroupMember).where(eq(friendGroupMember.groupId, groupId));
	return Number(n);
}

/** Join a group (no-op if already in it). Returns false if the group is full. */
export async function joinGroup(g: GroupRow, userId: string): Promise<boolean> {
	if (await isMember(g.id, userId)) return true;
	if ((await memberCount(g.id)) >= MAX_GROUP_MEMBERS) return false;
	await db.insert(friendGroupMember).ignore().values({ groupId: g.id, userId });
	return true;
}

/**
 * Leave a group. If the owner leaves, the person who's been in it longest takes over; the last
 * person out deletes it. Lists already shared through the group stay shared.
 */
export async function leaveGroup(g: GroupRow, userId: string) {
	await db.transaction(async (tx) => {
		await tx.delete(friendGroupMember).where(and(eq(friendGroupMember.groupId, g.id), eq(friendGroupMember.userId, userId)));
		if (g.ownerId !== userId) return;
		const [next] = await tx
			.select({ userId: friendGroupMember.userId })
			.from(friendGroupMember)
			.where(eq(friendGroupMember.groupId, g.id))
			.orderBy(asc(friendGroupMember.joinedAt))
			.limit(1);
		if (next) await tx.update(friendGroup).set({ ownerId: next.userId }).where(eq(friendGroup.id, g.id));
		else await tx.delete(friendGroup).where(eq(friendGroup.id, g.id));
	});
}

export async function removeMember(g: GroupRow, userId: string) {
	if (userId === g.ownerId) return;
	await db.delete(friendGroupMember).where(and(eq(friendGroupMember.groupId, g.id), eq(friendGroupMember.userId, userId)));
}

/**
 * Invite everyone in a group (except the list's owner) to a list. People already invited are
 * skipped and not emailed again. Later joiners aren't added: share with the group again for them.
 * `sharer` must be in the group. Returns how many people were newly invited.
 */
export async function shareListWithGroup(l: ListRow, sharer: { id: string; name: string }, groupId: string, origin: string): Promise<number> {
	await groupForMember(groupId, sharer.id);
	const people = await db
		.select({ id: user.id, email: user.email })
		.from(friendGroupMember)
		.innerJoin(user, eq(user.id, friendGroupMember.userId))
		.where(and(eq(friendGroupMember.groupId, groupId), ne(user.id, l.ownerId)));
	if (!people.length) return 0;
	const emails = people.map((p) => p.email.toLowerCase());
	const already = new Set(
		(
			await db
				.select({ email: listShare.email, userId: listShare.userId })
				.from(listShare)
				.where(eq(listShare.listId, l.id))
		).flatMap((r) => [r.email, r.userId])
	);
	const fresh = people.filter((p, i) => !already.has(emails[i]) && !already.has(p.id));
	let added = 0;
	for (const p of fresh) {
		const shareId = newId();
		const email = p.email.toLowerCase();
		const [res] = await db.insert(listShare).ignore().values({ id: shareId, listId: l.id, email, userId: p.id, groupId });
		if ((res as { affectedRows?: number }).affectedRows !== 1) continue;
		added++;
		await sendListInviteEmail({
			email,
			ownerName: sharer.name,
			listTitle: l.title,
			url: `${origin}/lists/${l.id}?invite=${shareId}`
		}).catch(() => {});
	}
	return added;
}
