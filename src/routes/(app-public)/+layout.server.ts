import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

// Pages here work signed out (public lists, secret links, profiles, Santa invites),
// but a signed-in user who hasn't set a name still finishes onboarding first.
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.user && !locals.user.name) {
		redirect(303, `/welcome?next=${encodeURIComponent(url.pathname + url.search)}`);
	}
};
