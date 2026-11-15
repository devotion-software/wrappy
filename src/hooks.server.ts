import { auth } from '#lib/auth';
import { usingR2 } from '#lib/server/storage';
import { startReminders } from '#lib/server/reminders';
import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building, dev } from '$app/env';

/**
 * Refuse to serve production with a missing, short or placeholder auth secret (it signs every
 * session), then start the reminder timer.
 */
export const init: ServerInit = () => {
	if (building) return;
	if (!dev) {
		const secret = process.env.BETTER_AUTH_SECRET ?? '';
		if (secret.length < 32 || /change|example|secret|placeholder/i.test(secret)) {
			throw new Error('BETTER_AUTH_SECRET must be a random value of at least 32 characters (openssl rand -base64 32).');
		}
		// Local-disk uploads are only visible to the instance that wrote them, so production needs shared storage.
		if (!usingR2 && process.env.ALLOW_LOCAL_UPLOADS !== 'true') {
			throw new Error('Set the R2_* variables for image storage (or ALLOW_LOCAL_UPLOADS=true for a single instance).');
		}
	}
	// Reminder emails (server/reminders.ts): on in production, opt-in in dev with REMINDERS=on.
	const reminders = process.env.REMINDERS ?? (dev ? 'off' : 'on');
	if (reminders === 'on' && !process.env.VITEST) {
		startReminders(
			(process.env.BETTER_AUTH_URL ?? 'http://localhost:5182').replace(/\/$/, ''),
			Number(process.env.REMINDER_INTERVAL_MINUTES) || 60
		);
	}
};

export const handle: Handle = async ({ event, resolve }) => {
	// Populate locals for every request so load functions & actions can gate access.
	// Better Auth's own endpoints are served by src/routes/api/auth/[...all].
	const session = await auth.api.getSession({ headers: event.request.headers });
	event.locals.user = session?.user ?? null;
	event.locals.session = session?.session ?? null;

	// Everything under (app) needs a signed-in user. Checked here, not only in the layout load,
	// because form actions and page loads don't wait for the layout.
	if (!event.locals.user && event.route.id?.startsWith('/(app)/')) {
		// For form actions, return to the page itself rather than the "?/action" URL.
		const back = event.request.method === 'GET' ? event.url.pathname + event.url.search : event.url.pathname;
		redirect(303, `/signin?next=${encodeURIComponent(back)}`);
	}

	// Apply a signed-in user's forced theme during SSR so it's right before first paint.
	// Validated so a stored value can't inject markup.
	const theme = event.locals.user?.theme;
	const forced = theme === 'light' || theme === 'dark' ? theme : null;
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			forced ? html.replace('<html lang="en">', `<html lang="en" data-theme="${forced}">`) : html
	});
	// The CSP itself (incl. frame-ancestors) is set by kit.csp in vite.config.ts.
	try {
		for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
			if (!response.headers.has(name)) response.headers.set(name, value);
		}
	} catch {
		/* some responses (e.g. proxied fetches) have immutable headers */
	}
	return response;
};

const SECURITY_HEADERS: Record<string, string> = {
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy': 'camera=(), microphone=(), geolocation=()',
	// Ignored by browsers over plain http (local dev).
	'strict-transport-security': 'max-age=31536000; includeSubDomains'
};
