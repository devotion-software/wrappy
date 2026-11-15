import { error } from '@sveltejs/kit';
import { getEmailPrefs, readUnsubscribeToken, REMINDER_LABELS, setEmailPrefs } from '#lib/server/emailPrefs';
import type { Actions, PageServerLoad } from './$types';

/**
 * Unsubscribe link from a reminder email. Works signed out (the signed token is the proof).
 * Opening the link only shows a button: some mail scanners open every link in an email, and
 * a plain GET shouldn't change anything.
 */
export const load: PageServerLoad = async ({ params }) => {
	const t = readUnsubscribeToken(params.token);
	if (!t) error(404, "This link doesn't work. You can choose which emails you get on your account page.");
	const prefs = await getEmailPrefs(t.userId);
	return { kind: t.kind, label: REMINDER_LABELS[t.kind], on: prefs[t.kind] };
};

export const actions: Actions = {
	default: async ({ params }) => {
		const t = readUnsubscribeToken(params.token);
		if (!t) error(404, "This link doesn't work.");
		await setEmailPrefs(t.userId, { [t.kind]: false });
		return { done: true };
	}
};
