import { error, fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { getGroupByToken, groupMembers, isMember, joinGroup } from '#lib/server/groups';
import type { Actions, PageServerLoad } from './$types';

const GONE = 'This invite link no longer works. Ask someone in the group for a new one.';

export const load: PageServerLoad = async ({ params, locals }) => {
	const g = await getGroupByToken(params.token);
	if (!g) error(404, GONE);
	if (locals.user && (await isMember(g.id, locals.user.id))) redirect(303, `/groups/${g.id}`);
	const [[owner], members] = await Promise.all([
		db.select({ name: user.name }).from(user).where(eq(user.id, g.ownerId)),
		groupMembers(g.id)
	]);
	return {
		group: { name: g.name },
		ownerName: owner?.name ?? 'Someone',
		members: members.map((m) => ({ id: m.id, name: m.name })),
		meta: { title: `Join ${g.name}`, description: `${owner?.name ?? 'Someone'} invited you to a group on Wrappy.` }
	};
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		if (!locals.user) redirect(303, `/signin?next=${encodeURIComponent(`/groups/join/${params.token}`)}`);
		const g = await getGroupByToken(params.token);
		if (!g) error(404, GONE);
		if (!(await joinGroup(g, locals.user.id))) return fail(400, { joinError: 'This group is full.' });
		redirect(303, `/groups/${g.id}`);
	}
};
