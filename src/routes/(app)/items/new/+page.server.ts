import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list, santa } from '#lib/server/db/schema';
import { createItem, parseItemForm, santaPriceProblem } from '#lib/server/items';
import { formatPrice } from '#lib/format';
import type { Actions, PageServerLoad } from './$types';

async function targetList(userId: string, listId: string | null) {
	if (!listId) return null;
	const [l] = await db
		.select({ id: list.id, title: list.title, santaId: list.santaId, limit: santa.priceLimit, currency: santa.currency })
		.from(list)
		.leftJoin(santa, eq(santa.id, list.santaId))
		.where(and(eq(list.id, listId), eq(list.ownerId, userId)))
		.limit(1);
	return l ?? null;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const l = await targetList(locals.user!.id, url.searchParams.get('list'));
	return {
		target: l
			? { id: l.id, title: l.title, santaLimit: l.santaId ? formatPrice(l.limit, l.currency ?? 'GBP') : null, currency: l.currency }
			: null
	};
};

export const actions: Actions = {
	default: async ({ locals, request, url }) => {
		const fd = await request.formData();
		const parsed = parseItemForm(fd);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const l = await targetList(locals.user!.id, url.searchParams.get('list'));
		if (l?.santaId) {
			const problem = await santaPriceProblem(l.id, parsed.input);
			if (problem) return fail(400, { error: problem });
		}
		const { itemId } = await createItem(locals.user!.id, parsed.input, { listIds: l ? [l.id] : [] });
		redirect(303, `/items/${itemId}${l ? `?list=${l.id}` : ''}`);
	}
};
