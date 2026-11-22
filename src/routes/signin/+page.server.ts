import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { listShare } from '#lib/server/db/schema';
import { safeRedirect } from '#lib/safeRedirect';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const next = safeRedirect(url.searchParams.get('next'));
	if (locals.user) redirect(303, locals.user.name ? next : `/welcome?next=${encodeURIComponent(next)}`);
	const email = await inviteEmail(url.searchParams.get('invite'));
	return email ? { next, email } : { next };
};

/** The address a list invite was sent to, so someone following the emailed link doesn't retype it. */
async function inviteEmail(id: string | null): Promise<string | null> {
	if (!id || !/^[0-9A-Za-z]{22}$/.test(id)) return null;
	const [row] = await db.select({ email: listShare.email }).from(listShare).where(eq(listShare.id, id)).limit(1);
	return row?.email ?? null;
}
