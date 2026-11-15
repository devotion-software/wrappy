import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isRedirect } from '@sveltejs/kit';

const state = vi.hoisted(() => ({
	session: null as null | { user: Record<string, unknown>; session: Record<string, unknown> },
	dev: false,
	building: false,
	r2: false
}));
const getSession = vi.hoisted(() => vi.fn(async () => state.session));

vi.mock('#lib/auth', () => ({ auth: { api: { getSession } } }));
vi.mock('#lib/server/storage', () => ({
	get usingR2() {
		return state.r2;
	}
}));
vi.mock('$app/env', () => ({
	get dev() {
		return state.dev;
	},
	get building() {
		return state.building;
	},
	browser: false,
	version: 'test'
}));

import { handle, init } from './hooks.server';

const HTML = '<!doctype html><html lang="en"><body>hi</body></html>';

function makeEvent(path: string, routeId: string | null, method = 'GET') {
	const url = new URL(path, 'http://localhost:5182');
	return {
		url,
		route: { id: routeId },
		request: new Request(url, { method, headers: { cookie: 'session=abc' } }),
		locals: {} as Record<string, unknown>
	};
}

function makeResolve(headers: Record<string, string> = {}) {
	return vi.fn(async (_event: unknown, opts?: { transformPageChunk?: (a: { html: string; done: boolean }) => string }) => {
		const html = opts?.transformPageChunk ? opts.transformPageChunk({ html: HTML, done: true }) : HTML;
		return new Response(html, { headers: { 'content-type': 'text/html', ...headers } });
	});
}

async function run(path: string, routeId: string | null, method = 'GET', resolve = makeResolve()) {
	const event = makeEvent(path, routeId, method);
	try {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const response = await handle({ event, resolve } as any);
		return { event, response, resolve, redirect: null as null | { status: number; location: string } };
	} catch (e) {
		if (isRedirect(e)) return { event, response: null, resolve, redirect: { status: e.status, location: e.location } };
		throw e;
	}
}

const signedIn = (user: Record<string, unknown> = {}) => {
	state.session = { user: { id: 'u1', name: 'Sam', email: 'sam@example.test', ...user }, session: { id: 's1' } };
};

beforeEach(() => {
	state.session = null;
	getSession.mockClear();
});

describe('handle', () => {
	it('passes request headers to Better Auth and fills locals', async () => {
		signedIn();
		const { event } = await run('/lists', '/(app)/lists');
		expect(getSession).toHaveBeenCalledWith({ headers: event.request.headers });
		expect(event.locals.user).toMatchObject({ id: 'u1' });
		expect(event.locals.session).toMatchObject({ id: 's1' });
	});

	it('sets null locals for signed-out visitors', async () => {
		const { event } = await run('/', '/');
		expect(event.locals).toEqual({ user: null, session: null });
	});

	it('sends signed-out GETs on app pages to sign-in, keeping the query', async () => {
		const r = await run('/items/new?list=abc', '/(app)/items/new');
		expect(r.redirect).toEqual({ status: 303, location: `/signin?next=${encodeURIComponent('/items/new?list=abc')}` });
		expect(r.resolve).not.toHaveBeenCalled();
	});

	it('sends signed-out form posts back to the page, not the action URL', async () => {
		const r = await run('/lists/new?/default', '/(app)/lists/new', 'POST');
		expect(r.redirect).toEqual({ status: 303, location: `/signin?next=${encodeURIComponent('/lists/new')}` });
	});

	it.each([
		['/', '/'],
		['/lists/abc', '/(app-public)/lists/[id]'],
		['/signin', '/signin'],
		['/api/auth/get-session', '/api/auth/[...all]'],
		['/nowhere', null]
	])('lets signed-out visitors reach %s', async (path, routeId) => {
		const r = await run(path, routeId);
		expect(r.redirect).toBeNull();
		expect(r.response?.status).toBe(200);
	});

	it('lets signed-in users reach app pages', async () => {
		signedIn();
		const r = await run('/lists', '/(app)/lists');
		expect(r.redirect).toBeNull();
	});

	it('adds security headers', async () => {
		const { response } = await run('/', '/');
		expect(Object.fromEntries(response!.headers)).toMatchObject({
			'x-content-type-options': 'nosniff',
			'x-frame-options': 'DENY',
			'referrer-policy': 'strict-origin-when-cross-origin',
			'permissions-policy': 'camera=(), microphone=(), geolocation=()',
			'strict-transport-security': 'max-age=31536000; includeSubDomains'
		});
	});

	it('does not override headers a route already set', async () => {
		const { response } = await run('/', '/', 'GET', makeResolve({ 'referrer-policy': 'no-referrer' }));
		expect(response!.headers.get('referrer-policy')).toBe('no-referrer');
		expect(response!.headers.get('x-frame-options')).toBe('DENY');
	});

	it('survives responses with immutable headers', async () => {
		const resolve = vi.fn(async () => Response.redirect('http://localhost:5182/x', 302));
		const { response } = await run('/', '/', 'GET', resolve as never);
		expect(response!.status).toBe(302);
	});

	it.each(['light', 'dark'])('applies a forced %s theme to the page', async (theme) => {
		signedIn({ theme });
		const { response } = await run('/lists', '/(app)/lists');
		expect(await response!.text()).toContain(`<html lang="en" data-theme="${theme}">`);
	});

	it.each(['system', null, undefined, '"><script>alert(1)</script>', 'DARK'])('leaves the theme alone for %j', async (theme) => {
		signedIn({ theme });
		const { response } = await run('/lists', '/(app)/lists');
		const html = await response!.text();
		expect(html).toContain('<html lang="en">');
		expect(html).not.toContain('data-theme');
		expect(html).not.toContain('<script>');
	});

	it('does not theme pages for signed-out visitors', async () => {
		const { response } = await run('/', '/');
		expect(await response!.text()).not.toContain('data-theme');
	});
});

describe('init', () => {
	const saved = { secret: process.env.BETTER_AUTH_SECRET, local: process.env.ALLOW_LOCAL_UPLOADS };
	const GOOD = 'q8Vt3mZr7Lx2Pn5Wb9Hc4Jd6Kf1Gs0Ya+Ue/Io=';

	beforeEach(() => {
		state.dev = false;
		state.building = false;
		state.r2 = true;
		process.env.BETTER_AUTH_SECRET = GOOD;
		delete process.env.ALLOW_LOCAL_UPLOADS;
	});
	afterEach(() => {
		process.env.BETTER_AUTH_SECRET = saved.secret;
		if (saved.local === undefined) delete process.env.ALLOW_LOCAL_UPLOADS;
		else process.env.ALLOW_LOCAL_UPLOADS = saved.local;
	});

	const runInit = () => (init as () => void)();

	it('accepts a strong secret with R2 configured', () => {
		expect(runInit).not.toThrow();
	});

	it.each([
		['missing', undefined],
		['short', 'abc123'],
		['placeholder', 'change-me-dev-secret-change-me-dev-secret='],
		['example', 'example-example-example-example-example'],
		['contains "secret"', 'mysecretmysecretmysecretmysecretmysecret'],
		['contains "placeholder"', 'PLACEHOLDER-xxxxxxxxxxxxxxxxxxxxxxxxxxxx']
	])('refuses a %s secret', (_label, secret) => {
		if (secret === undefined) delete process.env.BETTER_AUTH_SECRET;
		else process.env.BETTER_AUTH_SECRET = secret;
		expect(runInit).toThrow(/BETTER_AUTH_SECRET/);
	});

	it('refuses to start without R2', () => {
		state.r2 = false;
		expect(runInit).toThrow(/R2_/);
	});

	it('allows local uploads only when explicitly enabled', () => {
		state.r2 = false;
		process.env.ALLOW_LOCAL_UPLOADS = 'yes';
		expect(runInit).toThrow(/R2_/);
		process.env.ALLOW_LOCAL_UPLOADS = 'true';
		expect(runInit).not.toThrow();
	});

	it('skips the checks in dev and while building', () => {
		process.env.BETTER_AUTH_SECRET = 'short';
		state.r2 = false;
		state.dev = true;
		expect(runInit).not.toThrow();
		state.dev = false;
		state.building = true;
		expect(runInit).not.toThrow();
	});
});
