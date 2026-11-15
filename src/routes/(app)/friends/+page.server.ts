import { and, eq, isNotNull, isNull, like, ne, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list, user } from '#lib/server/db/schema';
import { friendsLists } from '#lib/server/lists';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user!;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	let results: { name: string; username: string; lists: number }[] = [];

	if (q.length >= 2) {
		const term = q.toLowerCase().replace(/^@/, '').replace(/[%_\\]/g, (c) => `\\${c}`);
		// Name / username are partial matches; email must match exactly (no address guessing).
		results = await db
			.select({ name: user.name, username: sql<string>`${user.username}`, lists: sql<number>`count(${list.id})` })
			.from(user)
			.innerJoin(list, and(eq(list.ownerId, user.id), eq(list.visibility, 'public'), isNull(list.santaId)))
			.where(
				and(
					ne(user.id, me.id),
					isNotNull(user.username),
					or(like(user.username, `${term}%`), like(user.name, `%${term}%`), eq(user.email, q.toLowerCase()))
				)
			)
			.groupBy(user.id, user.name, user.username)
			.orderBy(user.name)
			.limit(20);
	}

	return { q, results: results.map((r) => ({ ...r, lists: Number(r.lists) })), shared: await friendsLists(me.id, me.email) };
};
