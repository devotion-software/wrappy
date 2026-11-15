import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db';
import { santa } from '#lib/server/db/schema';
import { newId, newToken } from '#lib/server/ids';
import { getSanta, joinSanta } from '#lib/server/santa';
import { parseSantaForm } from '#lib/server/santaForm';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const fd = await request.formData();
		const parsed = parseSantaForm(fd);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const id = newId();
		await db.insert(santa).values({ id, ownerId: locals.user!.id, joinToken: newToken(), ...parsed.input });
		if (fd.get('playing') === 'on') await joinSanta((await getSanta(id))!, locals.user!.id);
		redirect(303, `/santa/${id}`);
	}
};
