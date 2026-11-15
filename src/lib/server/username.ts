import { and, eq, ne } from 'drizzle-orm';
import { db } from './db';
import { user } from './db/schema';

const RESERVED = new Set(['admin', 'api', 'app', 'help', 'lists', 'items', 'santa', 'friends', 'gifts', 'account', 'signin', 'welcome', 'me', 'wishlist']);

/** Lowercase letters, numbers, dots, dashes and underscores; 3–30 chars. Returns an error or null. */
export function usernameProblem(u: string): string | null {
	if (u.length < 3 || u.length > 30) return 'Usernames are 3 to 30 characters.';
	if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(u)) return 'Use lowercase letters, numbers, dots, dashes or underscores.';
	if (RESERVED.has(u)) return 'That username is taken.';
	return null;
}

export function suggestUsername(name: string): string {
	const base = name
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '.')
		.replace(/^\.+|\.+$/g, '')
		.slice(0, 24);
	return base.length >= 3 ? base : `${base || 'friend'}${Math.floor(100 + Math.random() * 900)}`;
}

export async function usernameTaken(u: string, exceptUserId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.username, u), ne(user.id, exceptUserId)))
		.limit(1);
	return !!row;
}

/** Validate and save a username. Returns an error message or null. */
export async function setUsername(userId: string, raw: string): Promise<string | null> {
	const u = raw.trim().toLowerCase().replace(/^@/, '');
	const problem = usernameProblem(u);
	if (problem) return problem;
	if (RESERVED.has(u) || (await usernameTaken(u, userId))) return 'That username is taken. Try another.';
	try {
		await db.update(user).set({ username: u }).where(eq(user.id, userId));
	} catch {
		return 'That username is taken. Try another.';
	}
	return null;
}
