/**
 * Anonymous Secret Santa messages. A giver can ask the person they drew a question ("what size?"),
 * and that person can reply, without learning who their Santa is.
 *
 * Threads are found from the viewer's side only: "the person I drew" or "whoever drew me". The
 * giver's id is never returned to the recipient.
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from './db';
import { santaMember, santaMessage, user } from './db/schema';
import { newId } from './ids';
import { getEmailPrefs, unsubscribeToken } from './emailPrefs';
import { sendSantaMessageEmail } from './email';
import type { SantaRow } from './santa';

export const MAX_MESSAGE = 1000;
/** Don't email about every message in a quick back-and-forth. */
const EMAIL_QUIET_MS = 10 * 60 * 1000;

export interface ThreadMessage {
	id: string;
	mine: boolean;
	body: string;
	at: string;
}

export type Direction = 'toRecipient' | 'toSanta';

/** The giver/recipient pair for `me` in each direction (only once names are drawn). */
async function pairFor(s: SantaRow, meId: string, direction: Direction): Promise<{ giverId: string; recipientId: string } | null> {
	if (s.status !== 'drawn') return null;
	if (direction === 'toRecipient') {
		const [m] = await db
			.select({ to: santaMember.assignedToId })
			.from(santaMember)
			.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, meId)));
		return m?.to ? { giverId: meId, recipientId: m.to } : null;
	}
	const [m] = await db
		.select({ from: santaMember.userId })
		.from(santaMember)
		.where(and(eq(santaMember.santaId, s.id), eq(santaMember.assignedToId, meId)));
	return m ? { giverId: m.from, recipientId: meId } : null;
}

async function thread(s: SantaRow, pair: { giverId: string; recipientId: string }, asGiver: boolean): Promise<ThreadMessage[]> {
	const rows = await db
		.select({ id: santaMessage.id, fromGiver: santaMessage.fromGiver, body: santaMessage.body, at: santaMessage.createdAt })
		.from(santaMessage)
		.where(
			and(eq(santaMessage.santaId, s.id), eq(santaMessage.giverId, pair.giverId), eq(santaMessage.recipientId, pair.recipientId))
		)
		.orderBy(asc(santaMessage.createdAt), asc(santaMessage.id));
	return rows.map((r) => ({ id: r.id, mine: r.fromGiver === asGiver, body: r.body, at: r.at.toISOString() }));
}

/**
 * Both of my threads in an exchange: with the person I drew, and with whoever drew me.
 * Null where there's no such person (names not drawn yet, or not taking part).
 */
export async function myThreads(s: SantaRow, meId: string): Promise<{ toRecipient: ThreadMessage[] | null; toSanta: ThreadMessage[] | null }> {
	const [give, get] = await Promise.all([pairFor(s, meId, 'toRecipient'), pairFor(s, meId, 'toSanta')]);
	return {
		toRecipient: give ? await thread(s, give, true) : null,
		toSanta: get ? await thread(s, get, false) : null
	};
}

/**
 * Send a message in one of my threads and email the other side (unless they've turned Secret Santa
 * emails off, or were already emailed about this thread in the last few minutes).
 */
export async function sendMessage(
	s: SantaRow,
	me: { id: string; name: string },
	direction: Direction,
	body: string,
	baseUrl: string
): Promise<{ error: string } | { sent: true }> {
	const text = body.replace(/\r\n/g, '\n').trim();
	if (!text) return { error: 'Write a message first.' };
	if (text.length > MAX_MESSAGE) return { error: `Keep it under ${MAX_MESSAGE.toLocaleString('en-GB')} characters.` };
	const pair = await pairFor(s, me.id, direction);
	if (!pair) return { error: "You can send messages once names have been drawn." };

	const fromGiver = direction === 'toRecipient';
	const [last] = await db
		.select({ at: santaMessage.createdAt })
		.from(santaMessage)
		.where(
			and(
				eq(santaMessage.santaId, s.id),
				eq(santaMessage.giverId, pair.giverId),
				eq(santaMessage.recipientId, pair.recipientId),
				eq(santaMessage.fromGiver, fromGiver)
			)
		)
		.orderBy(desc(santaMessage.createdAt))
		.limit(1);
	await db.insert(santaMessage).values({ id: newId(), santaId: s.id, ...pair, fromGiver, body: text });

	const toId = fromGiver ? pair.recipientId : pair.giverId;
	const recentlyEmailed = last && Date.now() - last.at.getTime() < EMAIL_QUIET_MS;
	if (!recentlyEmailed && (await getEmailPrefs(toId)).santa) {
		const [to] = await db.select({ email: user.email }).from(user).where(eq(user.id, toId));
		if (to) {
			await sendSantaMessageEmail({
				email: to.email,
				santaName: s.name,
				// The recipient never learns who their Santa is; the Santa already knows who they drew.
				from: fromGiver ? 'Your Secret Santa' : me.name,
				preview: text,
				url: `${baseUrl}/santa/${s.id}#messages`,
				unsubscribeUrl: `${baseUrl}/unsubscribe/${unsubscribeToken(toId, 'santa')}`,
				settingsUrl: `${baseUrl}/account#emails`
			}).catch((e) => console.error('santa message email failed', e));
		}
	}
	return { sent: true };
}
