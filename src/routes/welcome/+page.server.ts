import { fail, redirect } from '@sveltejs/kit';
import { auth } from '#lib/auth';
import { safeRedirect } from '#lib/safeRedirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, '/signin');
	return { next: safeRedirect(url.searchParams.get('next')), name: locals.user.name };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/signin');
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Add the name your friends know you by.', name });
		if (name.length > 60) return fail(400, { error: 'Keep it under 60 characters.', name });
		await auth.api.updateUser({ headers: request.headers, body: { name } });
		return { saved: true };
	}
};
