import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { emailPref } from './db/schema';

export const REMINDER_KINDS = ['list', 'buying', 'santa', 'price'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export type EmailPrefs = Record<ReminderKind, boolean>;

/** What each kind is, for the account page and the unsubscribe page. */
export const REMINDER_LABELS: Record<ReminderKind, string> = {
	list: 'Reminders before a friend’s list date',
	buying: 'Nudges about presents you said you’d get',
	santa: 'Secret Santa reminders and messages',
	price: 'Price drops on presents you could get'
};

const COLUMN = { list: 'listReminders', buying: 'buyingReminders', santa: 'santaReminders', price: 'priceAlerts' } as const;

export async function getEmailPrefs(userId: string): Promise<EmailPrefs> {
	const [row] = await db.select().from(emailPref).where(eq(emailPref.userId, userId)).limit(1);
	return {
		list: row?.listReminders ?? true,
		buying: row?.buyingReminders ?? true,
		santa: row?.santaReminders ?? true,
		price: row?.priceAlerts ?? true
	};
}

export async function setEmailPrefs(userId: string, prefs: Partial<EmailPrefs>): Promise<void> {
	const set = Object.fromEntries(
		Object.entries(prefs).map(([k, v]) => [COLUMN[k as ReminderKind], !!v])
	) as Partial<typeof emailPref.$inferInsert>;
	if (!Object.keys(set).length) return;
	await db
		.insert(emailPref)
		.values({ userId, ...set })
		.onDuplicateKeyUpdate({ set });
}

// ── Unsubscribe links ────────────────────────────────────────────────────────
// "<userId>.<kind>.<sig>": signed so a link only turns off that one person's emails of that kind.
// No expiry: an old email's link should keep working.

function secret(): string {
	const s = process.env.BETTER_AUTH_SECRET;
	if (!s) throw new Error('BETTER_AUTH_SECRET is not set');
	return s;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(`unsubscribe:${payload}`).digest('base64url');

export function unsubscribeToken(userId: string, kind: ReminderKind): string {
	const payload = `${userId}.${kind}`;
	return `${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string): { userId: string; kind: ReminderKind } | null {
	const parts = token.split('.');
	if (parts.length !== 3) return null;
	const [userId, kind, sig] = parts;
	if (!(REMINDER_KINDS as readonly string[]).includes(kind) || !userId) return null;
	const want = Buffer.from(sign(`${userId}.${kind}`));
	const got = Buffer.from(sig);
	if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
	return { userId, kind: kind as ReminderKind };
}
