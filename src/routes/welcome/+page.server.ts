import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { safeRedirect } from '#lib/safeRedirect';
import { setUsername, suggestUsername, usernameTaken } from '#lib/server/username';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/signin');
	let suggestion = locals.user.username ?? '';
	if (!suggestion && locals.user.name) {
		suggestion = suggestUsername(locals.user.name);
		if (await usernameTaken(suggestion, locals.user.id)) suggestion = '';
	}
	return {
		next: safeRedirect(url.searchParams.get('next')),
		name: locals.user.name,
		username: suggestion
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/signin');
		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		const username = String(fd.get('username') ?? '').trim();
		if (!name) return fail(400, { error: 'Add the name your friends know you by.', name, username });
		if (name.length > 60) return fail(400, { error: 'Keep your name under 60 characters.', name, username });
		await db.update(user).set({ name }).where(eq(user.id, locals.user.id));
		if (username) {
			const problem = await setUsername(locals.user.id, username);
			if (problem) return fail(400, { usernameError: problem, name, username });
		}
		return { saved: true };
	}
};
