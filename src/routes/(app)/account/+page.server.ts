import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { setUsername } from '#lib/server/username';
import { toCurrency } from '#lib/format';
import { getEmailPrefs, REMINDER_KINDS, REMINDER_LABELS, setEmailPrefs } from '#lib/server/emailPrefs';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const prefs = await getEmailPrefs(locals.user!.id);
	return { emails: REMINDER_KINDS.map((kind) => ({ kind, label: REMINDER_LABELS[kind], on: prefs[kind] })) };
};

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const me = locals.user!;
		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		const username = String(fd.get('username') ?? '').trim();
		if (!name) return fail(400, { error: 'Add the name your friends know you by.' });
		if (name.length > 60) return fail(400, { error: 'Keep your name under 60 characters.' });
		const currency = toCurrency(fd.get('currency'), me.currency);
		await db.update(user).set({ name, currency }).where(eq(user.id, me.id));
		if (username && username !== me.username) {
			const problem = await setUsername(me.id, username);
			if (problem) return fail(400, { usernameError: problem });
		}
		return { saved: true };
	},
	/** Reminder emails: each kind is a checkbox; unticked boxes aren't submitted, so absent = off. */
	emails: async ({ request, locals }) => {
		const fd = await request.formData();
		await setEmailPrefs(locals.user!.id, Object.fromEntries(REMINDER_KINDS.map((k) => [k, fd.get(k) === 'on'])));
		return { emailsSaved: true };
	}
};
