import { redirect } from '@sveltejs/kit';
import { safeRedirect } from '#lib/safeRedirect';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	const next = safeRedirect(url.searchParams.get('next'));
	if (locals.user) redirect(303, locals.user.name ? next : `/welcome?next=${encodeURIComponent(next)}`);
	return { next };
};
