import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	const next = encodeURIComponent(url.pathname + url.search);
	if (!locals.user) redirect(303, `/signin?next=${next}`);
	if (!locals.user.name) redirect(303, `/welcome?next=${next}`);
};
