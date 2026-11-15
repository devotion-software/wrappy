import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { setUsername } from '#lib/server/username';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const me = locals.user!;
		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		const username = String(fd.get('username') ?? '').trim();
		if (!name) return fail(400, { error: 'Add the name your friends know you by.' });
		if (name.length > 60) return fail(400, { error: 'Keep your name under 60 characters.' });
		await db.update(user).set({ name }).where(eq(user.id, me.id));
		if (username && username !== me.username) {
			const problem = await setUsername(me.id, username);
			if (problem) return fail(400, { usernameError: problem });
		}
		return { saved: true };
	}
};
