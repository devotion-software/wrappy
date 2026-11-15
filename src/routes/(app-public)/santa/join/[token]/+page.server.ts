import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { santaMember, user } from '#lib/server/db/schema';
import { getSantaByToken, joinSanta, membersOf } from '#lib/server/santa';
import { formatPrice } from '#lib/format';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const s = await getSantaByToken(params.token);
	if (!s) error(404, 'This invite link no longer works. Ask the organiser for a new one.');
	if (locals.user) {
		const [m] = await db
			.select({ userId: santaMember.userId })
			.from(santaMember)
			.where(and(eq(santaMember.santaId, s.id), eq(santaMember.userId, locals.user.id)))
			.limit(1);
		if (m || s.ownerId === locals.user.id) redirect(303, `/santa/${s.id}`);
	}
	const [[organiser], members] = await Promise.all([
		db.select({ name: user.name }).from(user).where(eq(user.id, s.ownerId)),
		membersOf(s.id)
	]);
	return {
		santa: {
			name: s.name,
			description: s.description,
			budget: formatPrice(s.priceLimit, s.currency),
			exchangeDate: s.exchangeDate,
			drawn: s.status === 'drawn'
		},
		organiserName: organiser?.name ?? 'Someone',
		members: members.map((m) => ({ id: m.userId, name: m.name }))
	};
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(`/santa/join/${params.token}`)}`);
		const s = await getSantaByToken(params.token);
		if (!s) error(404, 'This invite link no longer works.');
		await joinSanta(s, locals.user.id);
		redirect(303, `/santa/${s.id}`);
	}
};
