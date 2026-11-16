import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { user } from '#lib/server/db/schema';
import { suggestUsername } from '#lib/server/username';
import { createUser, uniq } from '../helpers/fixtures';
import { fakeEvent, outcome } from '../helpers/event';
import { load as rootLayout } from '../../src/routes/+layout.server';
import { load as home } from '../../src/routes/+page.server';
import { load as publicLayout } from '../../src/routes/(app-public)/+layout.server';
import { load as appLayout } from '../../src/routes/(app)/+layout.server';
import { load as signin } from '../../src/routes/signin/+page.server';
import { actions as welcomeActions, load as welcome } from '../../src/routes/welcome/+page.server';
import { actions as accountActions, load as accountLoad } from '../../src/routes/(app)/account/+page.server';
import { actions as unsubActions, load as unsubLoad } from '../../src/routes/unsubscribe/[token]/+page.server';
import { getEmailPrefs, unsubscribeToken } from '#lib/server/emailPrefs';

const L = (fn: any, init: Parameters<typeof fakeEvent>[0]) => outcome(() => fn(fakeEvent(init)));
const fresh = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

describe('root layout', () => {
	it('exposes only safe user fields', async () => {
		const u = await createUser({ username: `r${uniq()}`, theme: 'dark' });
		expect(await L(rootLayout, { user: u })).toEqual({
			kind: 'ok',
			data: { user: { id: u.id, name: u.name, email: u.email, theme: 'dark', username: u.username, currency: 'GBP' } }
		});
		expect(await L(rootLayout, {})).toEqual({ kind: 'ok', data: { user: null } });
	});

	it('defaults a missing theme to system', async () => {
		const u = await createUser();
		const data = (await L(rootLayout, { user: { ...u, theme: null } as any })) as any;
		expect(data.data.user.theme).toBe('system');
	});
});

describe('home page', () => {
	it('sends signed-in people to their lists', async () => {
		expect(await L(home, { user: await createUser() })).toEqual({ kind: 'redirect', status: 303, location: '/lists' });
		expect(await L(home, {})).toEqual({ kind: 'ok', data: undefined });
	});
});

describe('(app-public) layout', () => {
	it('lets signed-out and named visitors through', async () => {
		expect(await L(publicLayout, { path: '/u/x' })).toMatchObject({ kind: 'ok' });
		expect(await L(publicLayout, { user: await createUser(), path: '/u/x' })).toMatchObject({ kind: 'ok' });
	});

	it('sends a signed-in user without a name to onboarding, then back', async () => {
		const u = await createUser({ name: '' });
		expect(await L(publicLayout, { user: u, path: '/lists/abc?x=1' })).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/welcome?next=${encodeURIComponent('/lists/abc?x=1')}`
		});
	});
});

describe('(app) layout', () => {
	it('requires sign-in', async () => {
		expect(await L(appLayout, { path: '/items?q=1' })).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/signin?next=${encodeURIComponent('/items?q=1')}`
		});
	});

	it('requires a name', async () => {
		expect(await L(appLayout, { user: await createUser({ name: '' }), path: '/items' })).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/welcome?next=%2Fitems'
		});
		expect(await L(appLayout, { user: await createUser(), path: '/items' })).toMatchObject({ kind: 'ok' });
	});
});

describe('signin', () => {
	it('returns a sanitised next for signed-out visitors', async () => {
		expect(await L(signin, { path: '/signin?next=/santa/abc' })).toEqual({ kind: 'ok', data: { next: '/santa/abc' } });
		expect(await L(signin, { path: '/signin?next=https://evil.example' })).toEqual({ kind: 'ok', data: { next: '/lists' } });
		expect(await L(signin, { path: '/signin?next=//evil.example' })).toEqual({ kind: 'ok', data: { next: '/lists' } });
		expect(await L(signin, { path: '/signin' })).toEqual({ kind: 'ok', data: { next: '/lists' } });
	});

	it('forwards signed-in users to next, or to onboarding first', async () => {
		expect(await L(signin, { user: await createUser(), path: '/signin?next=/gifts' })).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/gifts'
		});
		expect(await L(signin, { user: await createUser({ name: '' }), path: '/signin?next=//evil.example' })).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/welcome?next=%2Flists'
		});
	});
});

describe('welcome', () => {
	it('requires sign-in', async () => {
		expect(await L(welcome, {})).toEqual({ kind: 'redirect', status: 303, location: '/signin' });
		expect(await L(welcomeActions.default, { form: { name: 'x' } })).toEqual({ kind: 'redirect', status: 303, location: '/signin' });
	});

	it('keeps an existing username', async () => {
		const u = await createUser({ username: `keep${uniq()}` });
		expect(await L(welcome, { user: u, path: '/welcome?next=/gifts' })).toEqual({
			kind: 'ok',
			data: { next: '/gifts', name: u.name, username: u.username }
		});
	});

	it('suggests a username from the name when it is free', async () => {
		const name = `Zed Q${uniq()}`;
		const u = await createUser({ name });
		const data = (await L(welcome, { user: u })) as any;
		expect(data.data.username).toBe(suggestUsername(name));
		expect(data.data.next).toBe('/lists');
	});

	it('suggests nothing when the derived username is taken', async () => {
		const name = `Taken Q${uniq()}`;
		await createUser({ username: suggestUsername(name) });
		const u = await createUser({ name });
		expect(((await L(welcome, { user: u })) as any).data.username).toBe('');
	});

	it('suggests nothing when there is no name yet', async () => {
		const u = await createUser({ name: '' });
		expect(((await L(welcome, { user: u })) as any).data.username).toBe('');
	});

	it('validates the name', async () => {
		const u = await createUser({ name: '' });
		expect(await L(welcomeActions.default, { user: u, form: { name: '  ', username: 'abc' } })).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: 'Add the name your friends know you by.', name: '', username: 'abc' }
		});
		expect(await L(welcomeActions.default, { user: u, form: { name: 'x'.repeat(61) } })).toMatchObject({
			kind: 'fail',
			data: { error: 'Keep your name under 60 characters.' }
		});
		expect((await fresh(u.id)).name).toBe('');
	});

	it('saves the name and username', async () => {
		const u = await createUser({ name: '' });
		const handle = `@Wel${uniq()}`;
		expect(await L(welcomeActions.default, { user: u, form: { name: ' Sam ', username: handle } })).toEqual({
			kind: 'ok',
			data: { saved: true }
		});
		expect(await fresh(u.id)).toMatchObject({ name: 'Sam', username: handle.slice(1).toLowerCase() });
	});

	it('saves the name but reports a bad or taken username', async () => {
		const u = await createUser({ name: '' });
		expect(await L(welcomeActions.default, { user: u, form: { name: 'Sam', username: 'a!' } })).toMatchObject({
			kind: 'fail',
			status: 400,
			data: { usernameError: expect.any(String), name: 'Sam', username: 'a!' }
		});
		expect((await fresh(u.id)).name).toBe('Sam');

		const other = await createUser({ username: `own${uniq()}` });
		expect(await L(welcomeActions.default, { user: u, form: { name: 'Sam', username: other.username! } })).toMatchObject({
			kind: 'fail',
			data: { usernameError: 'That username is taken. Try another.' }
		});
		expect(await L(welcomeActions.default, { user: u, form: { name: 'Sam', username: 'admin' } })).toMatchObject({
			kind: 'fail',
			data: { usernameError: expect.stringContaining('taken') }
		});
		expect((await fresh(u.id)).username).toBeNull();
	});

	it('allows skipping the username', async () => {
		const u = await createUser({ name: '' });
		expect(await L(welcomeActions.default, { user: u, form: { name: 'Sam', username: '' } })).toEqual({ kind: 'ok', data: { saved: true } });
		expect((await fresh(u.id)).username).toBeNull();
	});
});

describe('account', () => {
	it('validates the name', async () => {
		const u = await createUser();
		expect(await L(accountActions.profile, { user: u, form: { name: '' } })).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: 'Add the name your friends know you by.' }
		});
		expect(await L(accountActions.profile, { user: u, form: { name: 'n'.repeat(61) } })).toMatchObject({ kind: 'fail', status: 400 });
		expect((await fresh(u.id)).name).toBe(u.name);
	});

	it('saves the name and a changed username', async () => {
		const u = await createUser({ username: `old${uniq()}` });
		const next = `new${uniq()}`;
		expect(await L(accountActions.profile, { user: u, form: { name: 'Renamed', username: next } })).toEqual({
			kind: 'ok',
			data: { saved: true }
		});
		expect(await fresh(u.id)).toMatchObject({ name: 'Renamed', username: next });
	});

	it('leaves the username alone when unchanged or blank', async () => {
		const u = await createUser({ username: `same${uniq()}` });
		await L(accountActions.profile, { user: u, form: { name: 'A', username: u.username! } });
		await L(accountActions.profile, { user: u, form: { name: 'B', username: '' } });
		expect(await fresh(u.id)).toMatchObject({ name: 'B', username: u.username });
	});

	it('reports a taken username', async () => {
		const other = await createUser({ username: `tk${uniq()}` });
		const u = await createUser({ username: `me${uniq()}` });
		expect(await L(accountActions.profile, { user: u, form: { name: 'X', username: other.username!.toUpperCase() } })).toEqual({
			kind: 'fail',
			status: 400,
			data: { usernameError: 'That username is taken. Try another.' }
		});
		expect((await fresh(u.id)).username).toBe(u.username);
	});
});

describe('account currency', () => {
	it('saves a supported currency and keeps the old one otherwise', async () => {
		const u = await createUser();
		expect((await fresh(u.id)).currency).toBe('GBP');
		await L(accountActions.profile, { user: u, form: { name: 'A', currency: 'eur' } });
		expect((await fresh(u.id)).currency).toBe('EUR');
		await L(accountActions.profile, { user: { ...u, currency: 'EUR' }, form: { name: 'A', currency: 'XYZ' } });
		expect((await fresh(u.id)).currency).toBe('EUR');
	});
});

describe('account emails', () => {
	it('shows every reminder on by default and saves the ticked ones', async () => {
		const u = await createUser();
		const before = await outcome(() => accountLoad(fakeEvent({ user: u }) as any));
		expect(before).toMatchObject({ kind: 'ok', data: { emails: [{ kind: 'list', on: true }, { kind: 'buying', on: true }, { kind: 'santa', on: true }, { kind: 'price', on: true }] } });
		expect(await L(accountActions.emails, { user: u, form: { santa: 'on' } })).toEqual({ kind: 'ok', data: { emailsSaved: true } });
		const after = await outcome(() => accountLoad(fakeEvent({ user: u }) as any));
		expect((after as any).data.emails.map((e: any) => e.on)).toEqual([false, false, true, false]);
	});
});

describe('/unsubscribe/[token]', () => {
	it('shows what it turns off, and turns it off on POST only', async () => {
		const u = await createUser();
		const token = unsubscribeToken(u.id, 'buying');
		expect(await L(unsubLoad, { params: { token } })).toMatchObject({ kind: 'ok', data: { kind: 'buying', on: true } });
		expect((await getEmailPrefs(u.id)).buying).toBe(true);
		expect(await L(unsubActions.default, { params: { token }, form: {} })).toEqual({ kind: 'ok', data: { done: true } });
		expect(await getEmailPrefs(u.id)).toEqual({ list: true, buying: false, santa: true, price: true });
	});

	it('404s for a forged link', async () => {
		const u = await createUser();
		const token = `${u.id}.list.forged`;
		expect(await L(unsubLoad, { params: { token } })).toMatchObject({ kind: 'error', status: 404 });
		expect(await L(unsubActions.default, { params: { token }, form: {} })).toMatchObject({ kind: 'error', status: 404 });
	});
});
