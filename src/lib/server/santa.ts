import { error } from '@sveltejs/kit';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from './db';
import { list, santa, santaExclusion, santaMember, user } from './db/schema';
import { newId } from './ids';
import { drawAssignments } from './santaDraw';
import { sendSantaAssignmentEmail } from './email';
import { formatDate, formatPrice } from '#lib/format';

export type SantaRow = typeof santa.$inferSelect;

export async function getSanta(id: string): Promise<SantaRow | null> {
	const [s] = await db.select().from(santa).where(eq(santa.id, id)).limit(1);
	return s ?? null;
}

export async function getSantaByToken(token: string): Promise<SantaRow | null> {
	const [s] = await db.select().from(santa).where(eq(santa.joinToken, token)).limit(1);
	return s ?? null;
}

export async function membersOf(santaId: string) {
	return db
		.select({
			userId: santaMember.userId,
			name: user.name,
			email: user.email,
			listId: santaMember.listId,
			assignedToId: santaMember.assignedToId,
			joinedAt: santaMember.joinedAt
		})
		.from(santaMember)
		.innerJoin(user, eq(user.id, santaMember.userId))
		.where(eq(santaMember.santaId, santaId))
		.orderBy(asc(santaMember.joinedAt));
}

export async function exclusionsOf(santaId: string) {
	return db
		.select({ userA: santaExclusion.userA, userB: santaExclusion.userB })
		.from(santaExclusion)
		.where(eq(santaExclusion.santaId, santaId));
}

/** Join an exchange: creates the member's private Secret Santa wish list. Idempotent. */
export async function joinSanta(s: SantaRow, userId: string) {
	const [existing] = await db
		.select()
		.from(santaMember)
		.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, userId)))
		.limit(1);
	if (existing) return;
	if (s.status !== 'open') error(400, 'Names have already been drawn for this Secret Santa.');
	const listId = newId();
	await db.transaction(async (tx) => {
		await tx.insert(list).values({ id: listId, ownerId: userId, title: s.name, santaId: s.id, visibility: 'private' });
		await tx.insert(santaMember).values({ santaId: s.id, userId, listId });
	});
}

export async function leaveSanta(s: SantaRow, userId: string) {
	if (s.status !== 'open') error(400, "You can't leave after names have been drawn.");
	const [m] = await db
		.select()
		.from(santaMember)
		.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, userId)))
		.limit(1);
	if (!m) return;
	await db.transaction(async (tx) => {
		await tx.delete(santaMember).where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, userId)));
		await tx
			.delete(santaExclusion)
			.where(and(eq(santaExclusion.santaId, s.id), or(eq(santaExclusion.userA, userId), eq(santaExclusion.userB, userId))));
		// The Santa list only holds references to the member's items; deleting it keeps their items.
		if (m.listId) await tx.delete(list).where(eq(list.id, m.listId));
	});
}

/**
 * Draw names. Returns an error message when the draw is impossible.
 * Emails each member their match after the assignments are saved.
 */
export async function runDraw(s: SantaRow, baseUrl: string): Promise<string | null> {
	if (s.status !== 'open') return 'Names have already been drawn.';
	const members = await membersOf(s.id);
	if (members.length < 3) return 'You need at least 3 people to draw names.';
	const excl = await exclusionsOf(s.id);
	const result = drawAssignments(
		members.map((m) => m.userId),
		excl.map((e) => [e.userA, e.userB] as const)
	);
	if (!result) return "These rules make a draw impossible — remove an exclusion or invite more people.";

	await db.transaction(async (tx) => {
		for (const [giver, receiver] of result) {
			await tx
				.update(santaMember)
				.set({ assignedToId: receiver })
				.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, giver)));
		}
		await tx.update(santa).set({ status: 'drawn', drawnAt: sql`now(3)` }).where(eq(santa.id, s.id));
	});

	const byId = new Map(members.map((m) => [m.userId, m]));
	const budget = formatPrice(s.priceLimit, s.currency);
	await Promise.allSettled(
		[...result].map(([giver, receiver]) =>
			sendSantaAssignmentEmail({
				email: byId.get(giver)!.email,
				santaName: s.name,
				recipientName: byId.get(receiver)!.name,
				budget,
				exchangeDate: formatDate(s.exchangeDate),
				url: `${baseUrl}/santa/${s.id}`
			})
		)
	);
	return null;
}

export interface SantaSummary {
	id: string;
	name: string;
	status: 'open' | 'drawn';
	budget: string | null;
	exchangeDate: string | null;
	isOrganiser: boolean;
	isMember: boolean;
	memberCount: number;
	recipient: { name: string; listId: string | null } | null;
}

/** Exchanges the user organises or plays in, with who they're buying for once drawn. */
export async function mySantas(userId: string): Promise<SantaSummary[]> {
	const rows = await db
		.selectDistinct({ s: santa })
		.from(santa)
		.leftJoin(santaMember, and(eq(santaMember.santaId, santa.id), eq(santaMember.userId, userId)))
		.where(or(eq(santa.ownerId, userId), sql`${santaMember.userId} is not null`))
		.orderBy(asc(santa.createdAt));
	const ids = rows.map((r) => r.s.id);
	if (!ids.length) return [];

	const members = await db
		.select({ santaId: santaMember.santaId, userId: santaMember.userId, name: user.name, listId: santaMember.listId, assignedToId: santaMember.assignedToId })
		.from(santaMember)
		.innerJoin(user, eq(user.id, santaMember.userId))
		.where(inArray(santaMember.santaId, ids));

	return rows.map(({ s }) => {
		const ms = members.filter((m) => m.santaId === s.id);
		const me = ms.find((m) => m.userId === userId);
		const rec = me?.assignedToId ? ms.find((m) => m.userId === me.assignedToId) : null;
		return {
			id: s.id,
			name: s.name,
			status: s.status,
			budget: formatPrice(s.priceLimit, s.currency),
			exchangeDate: s.exchangeDate,
			isOrganiser: s.ownerId === userId,
			isMember: !!me,
			memberCount: ms.length,
			recipient: rec ? { name: rec.name, listId: rec.listId } : null
		};
	});
}
