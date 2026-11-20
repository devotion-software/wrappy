/**
 * Reminder emails, run on a timer by every app instance (see startReminders).
 *
 *  - list:   a friend's list date is 14 or 3 days away and you haven't claimed anything on it
 *  - buying: you said "I'll get it" two weeks ago and haven't marked it bought
 *  - santa:  the Secret Santa swap is a week away
 *
 * Owners are never emailed about their own lists, so nothing here can reveal a claim to them.
 * Each email is recorded in reminder_sent *before* it goes out, so overlapping runs on several
 * instances can't send it twice (the row is removed again if sending fails, to retry next run).
 */
import { and, eq, inArray, isNotNull, isNull, lt, between, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import type { Pool } from 'mysql2/promise';
import { db } from './db';
import {
	emailPref,
	item,
	itemClaim,
	itemList,
	list,
	listOccasion,
	listShare,
	listViewer,
	reminderSent,
	santa,
	santaMember,
	user
} from './db/schema';
import { usersWhoCanSee } from './access';
import { isFull } from './claimView';
import { sendBuyingReminderEmail, sendListReminderEmail, sendSantaReminderEmail } from './email';
import { unsubscribeToken, type ReminderKind } from './emailPrefs';
import { formatDate, formatPrice } from '#lib/format';

const DAY = 24 * 60 * 60 * 1000;
/** List reminders go out when the date is this many days away or fewer (each once). */
export const LIST_WINDOWS = [
	{ name: 'two-weeks', days: 14 },
	{ name: 'final', days: 3 }
] as const;
export const BUYING_AFTER_DAYS = 14;
export const SANTA_DAYS_BEFORE = 7;

export interface ReminderCounts {
	list: number;
	buying: number;
	santa: number;
}

/** "YYYY-MM-DD" in UTC, matching how list/santa dates are stored. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const daysBetween = (fromIso: string, toIso: string) =>
	Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);

export async function runReminders(baseUrl: string, now = new Date()): Promise<ReminderCounts> {
	const links = (userId: string, kind: ReminderKind) => ({
		unsubscribeUrl: `${baseUrl}/unsubscribe/${unsubscribeToken(userId, kind)}`,
		settingsUrl: `${baseUrl}/account#emails`
	});
	const [l, b, s] = [
		await listReminders(baseUrl, now, links),
		await buyingReminders(baseUrl, now, links),
		await santaReminders(baseUrl, now, links)
	];
	return { list: l, buying: b, santa: s };
}

type Links = (userId: string, kind: ReminderKind) => { unsubscribeUrl: string; settingsUrl: string };

/** Users (of `ids`) who've turned this kind off. */
export async function optedOut(ids: string[], kind: ReminderKind): Promise<Set<string>> {
	if (!ids.length) return new Set();
	const col = {
		list: emailPref.listReminders,
		buying: emailPref.buyingReminders,
		santa: emailPref.santaReminders,
		price: emailPref.priceAlerts
	}[kind];
	const rows = await db
		.select({ userId: emailPref.userId })
		.from(emailPref)
		.where(and(inArray(emailPref.userId, ids), eq(col, false)));
	return new Set(rows.map((r) => r.userId));
}

/** Record the reminder; false if it was already sent (by this or another instance). */
async function claimSlot(kind: ReminderKind, subjectKey: string, userId: string): Promise<boolean> {
	const [res] = await db.insert(reminderSent).ignore().values({ kind, subjectKey, userId });
	return res.affectedRows === 1;
}

export async function sendOnce(kind: ReminderKind, subjectKey: string, userId: string, send: () => Promise<void>): Promise<boolean> {
	if (!(await claimSlot(kind, subjectKey, userId))) return false;
	try {
		await send();
		return true;
	} catch (e) {
		console.error(`[reminders] ${kind} email to ${userId} failed`, e);
		await db
			.delete(reminderSent)
			.where(and(eq(reminderSent.kind, kind), eq(reminderSent.subjectKey, subjectKey), eq(reminderSent.userId, userId)));
		return false;
	}
}

async function listReminders(baseUrl: string, now: Date, links: Links): Promise<number> {
	const today = isoDay(now);
	const furthest = isoDay(new Date(now.getTime() + LIST_WINDOWS[0].days * DAY));
	const owner = alias(user, 'owner');
	const lists = await db
		.select({ list, ownerName: owner.name })
		.from(list)
		.innerJoin(owner, eq(owner.id, list.ownerId))
		.where(and(isNull(list.santaId), isNull(list.archivedAt), isNotNull(list.eventDate), between(list.eventDate, today, furthest)));
	// Lists with occasions get a reminder per occasion instead (their eventDate is just the last one).
	const occasions = await db
		.select({ list, ownerName: owner.name, date: listOccasion.occasionDate, name: listOccasion.name })
		.from(listOccasion)
		.innerJoin(list, eq(list.id, listOccasion.listId))
		.innerJoin(owner, eq(owner.id, list.ownerId))
		.where(and(isNull(list.archivedAt), isNull(listOccasion.openedAt), between(listOccasion.occasionDate, today, furthest)));
	const withOccasions = new Set(
		(
			await db
				.selectDistinct({ listId: listOccasion.listId })
				.from(listOccasion)
				.where(lists.length ? inArray(listOccasion.listId, lists.map((r) => r.list.id)) : sql`false`)
		).map((r) => r.listId)
	);
	const targets = [
		...lists.filter((r) => !withOccasions.has(r.list.id)).map((r) => ({ ...r, date: r.list.eventDate!, title: r.list.title })),
		...occasions.map((r) => ({ list: r.list, ownerName: r.ownerName, date: r.date, title: `${r.list.title} (${r.name})` }))
	];

	let sent = 0;
	for (const { list: l, ownerName, date, title } of targets) {
		const daysLeft = daysBetween(today, date);
		// The tightest window it's in, so a list made 2 days out only gets the final reminder.
		const window = [...LIST_WINDOWS].reverse().find((w) => daysLeft <= w.days)!;

		const onList = await db
			.select({ id: itemList.itemId, quantity: item.quantity, groupGift: item.groupGift, price: item.price })
			.from(itemList)
			.innerJoin(item, eq(item.id, itemList.itemId))
			.where(eq(itemList.listId, l.id));
		if (!onList.length) continue;
		const claimers = await db
			.select({ itemId: itemClaim.itemId, userId: itemClaim.userId, amount: itemClaim.amount })
			.from(itemClaim)
			.where(inArray(itemClaim.itemId, onList.map((i) => i.id)));
		// Items still open: not every one wanted is claimed, or a group gift isn't covered yet.
		const unclaimed = onList.filter((i) => !isFull(i, claimers.filter((c) => c.itemId === i.id))).length;
		if (unclaimed <= 0) continue;

		// People who've opened it or been invited, who can still see it and haven't claimed anything on it.
		const [viewers, shares] = await Promise.all([
			db.select({ userId: listViewer.userId }).from(listViewer).where(eq(listViewer.listId, l.id)),
			db
				.select({ userId: listShare.userId })
				.from(listShare)
				.where(and(eq(listShare.listId, l.id), isNotNull(listShare.userId)))
		]);
		const skip = new Set([l.ownerId, ...claimers.map((c) => c.userId)]);
		const candidates = [...new Set([...viewers, ...shares].map((r) => r.userId!))].filter((id) => !skip.has(id));
		if (!candidates.length) continue;
		const [canSee, off] = await Promise.all([usersWhoCanSee(l, candidates), optedOut(candidates, 'list')]);
		const to = candidates.filter((id) => canSee.has(id) && !off.has(id));
		if (!to.length) continue;

		const people = await db.select({ id: user.id, email: user.email }).from(user).where(inArray(user.id, to));
		for (const p of people) {
			const ok = await sendOnce('list', `${l.id}:${date}:${window.name}`, p.id, () =>
				sendListReminderEmail({
					email: p.email,
					url: `${baseUrl}/lists/${l.id}`,
					...links(p.id, 'list'),
					ownerName,
					listTitle: title,
					when: formatDate(date)!,
					daysLeft,
					unclaimed
				})
			);
			if (ok) sent++;
		}
	}
	return sent;
}

async function buyingReminders(baseUrl: string, now: Date, links: Links): Promise<number> {
	const owner = alias(user, 'owner');
	const claimer = alias(user, 'claimer');
	const stale = await db
		.select({
			itemId: item.id,
			title: item.title,
			ownerName: owner.name,
			claimerId: claimer.id,
			email: claimer.email,
			updatedAt: itemClaim.updatedAt
		})
		.from(itemClaim)
		.innerJoin(item, eq(item.id, itemClaim.itemId))
		.innerJoin(owner, eq(owner.id, item.ownerId))
		.innerJoin(claimer, eq(claimer.id, itemClaim.userId))
		.where(and(eq(itemClaim.status, 'buying'), lt(itemClaim.updatedAt, new Date(now.getTime() - BUYING_AFTER_DAYS * DAY))));
	if (!stale.length) return 0;

	const off = await optedOut([...new Set(stale.map((s) => s.claimerId))], 'buying');
	let sent = 0;
	for (const c of stale) {
		if (off.has(c.claimerId)) continue;
		// Link to a list the claimer can still open that has this wish on it.
		const lists = await db
			.select({ list })
			.from(itemList)
			.innerJoin(list, eq(list.id, itemList.listId))
			.where(eq(itemList.itemId, c.itemId));
		let listId: string | null = null;
		for (const { list: l } of lists) {
			if ((await usersWhoCanSee(l, [c.claimerId])).has(c.claimerId)) {
				listId = l.id;
				break;
			}
		}
		if (!listId) continue;

		const weeks = Math.max(2, Math.floor((now.getTime() - c.updatedAt.getTime()) / (7 * DAY)));
		// Keyed on when it was claimed, so claiming it again later can earn a fresh nudge.
		const ok = await sendOnce('buying', `${c.itemId}:${c.updatedAt.getTime()}`, c.claimerId, () =>
			sendBuyingReminderEmail({
				email: c.email,
				url: `${baseUrl}/lists/${listId}/items/${c.itemId}`,
				...links(c.claimerId, 'buying'),
				ownerName: c.ownerName,
				itemTitle: c.title,
				weeks
			})
		);
		if (ok) sent++;
	}
	return sent;
}

async function santaReminders(baseUrl: string, now: Date, links: Links): Promise<number> {
	const today = isoDay(now);
	const until = isoDay(new Date(now.getTime() + SANTA_DAYS_BEFORE * DAY));
	const giver = alias(user, 'giver');
	const receiver = alias(user, 'receiver');
	const rows = await db
		.select({ santa, giverId: giver.id, email: giver.email, recipientName: receiver.name })
		.from(santaMember)
		.innerJoin(santa, eq(santa.id, santaMember.santaId))
		.innerJoin(giver, eq(giver.id, santaMember.userId))
		.innerJoin(receiver, eq(receiver.id, santaMember.assignedToId))
		.where(and(eq(santa.status, 'drawn'), isNotNull(santa.exchangeDate), between(santa.exchangeDate, today, until)));
	if (!rows.length) return 0;

	const off = await optedOut([...new Set(rows.map((r) => r.giverId))], 'santa');
	let sent = 0;
	for (const r of rows) {
		if (off.has(r.giverId)) continue;
		const s = r.santa;
		const ok = await sendOnce('santa', `${s.id}:${s.exchangeDate}:week`, r.giverId, () =>
			sendSantaReminderEmail({
				email: r.email,
				url: `${baseUrl}/santa/${s.id}`,
				...links(r.giverId, 'santa'),
				santaName: s.name,
				recipientName: r.recipientName,
				when: formatDate(s.exchangeDate)!,
				daysLeft: daysBetween(today, s.exchangeDate!),
				budget: formatPrice(s.priceLimit, s.currency)
			})
		);
		if (ok) sent++;
	}
	return sent;
}

// ── Scheduler ────────────────────────────────────────────────────────────────

const LOCK = 'wrappy_reminders';
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Run reminders now and then every `everyMinutes`. Each instance runs this; a MariaDB named lock
 * lets one at a time do the work (the others skip that tick), and reminder_sent makes sends
 * idempotent anyway.
 */
export function startReminders(baseUrl: string, everyMinutes = 60): void {
	if (timer) return;
	const tick = async () => {
		const conn = await (db.$client as Pool).getConnection();
		try {
			const [[{ got }]] = (await conn.query('SELECT GET_LOCK(?, 0) AS got', [LOCK])) as unknown as [[{ got: number }]];
			if (got !== 1) return;
			try {
				const counts = await runReminders(baseUrl);
				const total = counts.list + counts.buying + counts.santa;
				if (total) console.log(`[reminders] sent ${JSON.stringify(counts)}`);
				// Price-drop checks share the timer and the lock. Imported here to avoid an import cycle.
				if (process.env.PRICE_ALERTS !== 'off') {
					const { runPriceChecks } = await import('./priceWatch');
					const prices = await runPriceChecks(baseUrl);
					if (prices.drops) console.log(`[prices] ${JSON.stringify(prices)}`);
				}
			} finally {
				await conn.query('SELECT RELEASE_LOCK(?)', [LOCK]);
			}
		} catch (e) {
			console.error('[reminders] run failed', e);
		} finally {
			conn.release();
		}
	};
	// Wait a little after boot so a rolling deploy's instances don't all start at once.
	setTimeout(tick, 30_000).unref?.();
	timer = setInterval(tick, everyMinutes * 60_000);
	timer.unref?.();
}
