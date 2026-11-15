import { auth } from '#lib/auth';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
	// Populate locals for every request so load functions & actions can gate access.
	// Better Auth's own endpoints are served by src/routes/api/auth/[...all].
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Apply a signed-in user's forced theme during SSR so it's right before first paint.
	// Validated so a stored value can't inject markup.
	const theme = event.locals.user?.theme;
	const forced = theme === 'light' || theme === 'dark' ? theme : null;
	return resolve(event, {
		transformPageChunk: ({ html }) =>
			forced ? html.replace('<html lang="en">', `<html lang="en" data-theme="${forced}">`) : html
	});
};
