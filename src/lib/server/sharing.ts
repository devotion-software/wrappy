import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { listShare } from './db/schema';

/** Link pending email invites to a newly created account. */
export async function claimInvitesForUser(userId: string, email: string) {
	await db
		.update(listShare)
		.set({ userId })
		.where(and(eq(listShare.email, email.toLowerCase()), isNull(listShare.userId)));
}
