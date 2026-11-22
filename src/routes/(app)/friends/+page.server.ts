import { and, eq, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list, user } from '#lib/server/db/schema';
import { friendsLists } from '#lib/server/lists';
import { createGroup, myGroups, parseGroupName } from '#lib/server/groups';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	let results: { name: string; username: string; lists: number }[] = [];

	if (q.length >= 2) {
		const handle = q.toLowerCase().replace(/^@/, '');
		const term = handle.replace(/[%_\\]/g, (c) => `\\${c}`);
		const lists = sql<number>`count(${list.id})`;
		// An exact username finds anyone, so you can look up a friend who has no public lists yet.
		// Partial name / username matches only find people with public lists, so search can't list
		// every account. No email lookup: it would reveal who has an account.
		results = await db
			.select({ name: user.name, username: sql<string>`${user.username}`, lists })
			.from(user)
			.leftJoin(list, and(eq(list.ownerId, user.id), eq(list.visibility, 'public'), isNull(list.santaId), isNull(list.archivedAt)))
			.where(
				and(
					ne(user.id, me.id),
					isNotNull(user.username),
					or(eq(user.username, handle), like(user.username, `${term}%`), like(user.name, `%${term}%`))
				)
			)
			.groupBy(user.id, user.name, user.username)
			.having(or(sql`${lists} > 0`, eq(user.username, handle)))
			.orderBy(sql`${user.username} = ${handle} desc`, user.name)
			.limit(20);
	}

	const [shared, groups] = await Promise.all([friendsLists(me.id, me.email), myGroups(me.id)]);
	return { q, results: results.map((r) => ({ ...r, lists: Number(r.lists) })), shared, groups };
};

export const actions: Actions = {
	createGroup: async ({ locals, request }) => {
		const parsed = parseGroupName((await request.formData()).get('name'));
		if ('error' in parsed) return fail(400, { groupError: parsed.error });
		const id = await createGroup(locals.user!.id, parsed.name);
		redirect(303, `/groups/${id}`);
	}
};
