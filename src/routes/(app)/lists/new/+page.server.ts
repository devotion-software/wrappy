import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { newId } from '#lib/server/ids';
import { parseListForm } from '#lib/server/listForm';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const parsed = parseListForm(await request.formData());
		if ('error' in parsed) return fail(400, parsed);
		const id = newId();
		await db.insert(list).values({ id, ownerId: locals.user!.id, ...parsed.input });
		redirect(303, `/lists/${id}`);
	}
};
