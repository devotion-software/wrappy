/**
 * Call SvelteKit load functions and form actions directly, without a server.
 *
 * `fakeEvent` builds the parts of a RequestEvent our code reads (locals, params, url, cookies,
 * request). `outcome` runs a load/action and turns SvelteKit's thrown redirects/errors and
 * returned `fail()`s into plain values that are easy to assert on.
 */
import { isActionFailure, isHttpError, isRedirect, type Cookies, type RequestEvent } from '@sveltejs/kit';
import type { TestUser } from './fixtures';

export const ORIGIN = 'http://localhost:5182';

export interface FakeCookies extends Cookies {
	/** Everything set during the request, with options, for assertions. */
	jar: Map<string, { value: string; opts: unknown }>;
}

export function fakeCookies(initial: Record<string, string> = {}): FakeCookies {
	const jar = new Map<string, { value: string; opts: unknown }>(Object.entries(initial).map(([k, v]) => [k, { value: v, opts: {} }]));
	return {
		jar,
		get: (name) => jar.get(name)?.value,
		getAll: () => [...jar].map(([name, { value }]) => ({ name, value })),
		set: (name, value, opts) => void jar.set(name, { value, opts }),
		delete: (name) => void jar.delete(name),
		serialize: (name, value) => `${name}=${value}`
	} as FakeCookies;
}

type FormInit = Record<string, string | string[] | Blob | File>;

export function formData(fields: FormInit = {}): FormData {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) {
		for (const one of Array.isArray(v) ? v : [v]) fd.append(k, one);
	}
	return fd;
}

export interface FakeEventInit {
	user?: TestUser | null;
	params?: Record<string, string>;
	/** Path + query, e.g. '/lists/abc?x=1'. */
	path?: string;
	/** Form fields; makes the request a POST. */
	form?: FormInit | FormData;
	method?: string;
	cookies?: Record<string, string> | FakeCookies;
	routeId?: string | null;
	headers?: Record<string, string>;
}

export function fakeEvent(init: FakeEventInit = {}) {
	const url = new URL(init.path ?? '/', ORIGIN);
	const body = init.form === undefined ? undefined : init.form instanceof FormData ? init.form : formData(init.form);
	const method = init.method ?? (body ? 'POST' : 'GET');
	const request = new Request(url, { method, body, headers: init.headers });
	const cookies = init.cookies && 'jar' in init.cookies ? (init.cookies as FakeCookies) : fakeCookies((init.cookies as Record<string, string>) ?? {});
	const headersSet: Record<string, string> = {};
	const event = {
		url,
		request,
		params: init.params ?? {},
		cookies,
		locals: { user: init.user ?? null, session: null },
		route: { id: init.routeId ?? null },
		setHeaders: (h: Record<string, string>) => Object.assign(headersSet, h),
		getClientAddress: () => '127.0.0.1',
		fetch,
		platform: undefined,
		isDataRequest: false,
		isSubRequest: false,
		isRemoteRequest: false
	};
	// Loads and actions are typed per route; the shape above is what they actually use.
	return Object.assign(event as unknown as RequestEvent & { params: Record<string, string> } & any, { headersSet, cookies });
}

export type Outcome =
	| { kind: 'ok'; data: any }
	| { kind: 'redirect'; status: number; location: string }
	| { kind: 'error'; status: number; message: string }
	| { kind: 'fail'; status: number; data: any };

/** Run a load/action/handler and describe how it finished. Unexpected exceptions still throw. */
export async function outcome(run: () => unknown): Promise<Outcome> {
	try {
		const data = await run();
		if (isActionFailure(data)) return { kind: 'fail', status: data.status, data: data.data };
		return { kind: 'ok', data };
	} catch (e) {
		if (isRedirect(e)) return { kind: 'redirect', status: e.status, location: e.location };
		if (isHttpError(e)) return { kind: 'error', status: e.status, message: e.body.message };
		throw e;
	}
}

/** Like `outcome`, but asserts it finished normally and returns the data. */
export async function ok<T = any>(run: () => unknown): Promise<T> {
	const o = await outcome(run);
	if (o.kind !== 'ok') throw new Error(`Expected success, got ${JSON.stringify(o)}`);
	return o.data as T;
}
