import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const u = locals.user;
	return {
		user: u ? { id: u.id, name: u.name, email: u.email, theme: u.theme ?? 'system', username: u.username ?? null } : null
	};
};
