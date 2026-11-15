import { describe, expect, it } from 'vitest';
import { newToken } from '#lib/server/ids';
import { addSantaMember, createList, createSanta, createUser } from '../helpers/fixtures';
import { fakeCookies, fakeEvent, outcome } from '../helpers/event';
import { load } from '../../src/routes/s/[token]/+page.server';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';

describe('/s/[token]', () => {
	it('remembers the token for this browser and opens the list', async () => {
		const owner = await createUser();
		const token = newToken();
		const l = await createList(owner, { shareToken: token });
		const cookies = fakeCookies();
		expect(await outcome(() => (load as any)(fakeEvent({ params: { token }, cookies })))).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/lists/${l.id}`
		});
		expect(cookies.jar.get(`wl_${l.id}`)).toMatchObject({ value: token, opts: { httpOnly: true, path: '/' } });
	});

	it('404s for an unknown or turned-off link', async () => {
		const cookies = fakeCookies();
		expect(await outcome(() => (load as any)(fakeEvent({ params: { token: newToken() }, cookies })))).toEqual({
			kind: 'error',
			status: 404,
			message: 'This link has been turned off. Ask the list owner for a new one.'
		});
		expect(cookies.jar.size).toBe(0);
	});

	it('ignores tokens on Secret Santa lists', async () => {
		const s = await createSanta(await createUser());
		const member = await createUser();
		const l = await addSantaMember(s, member);
		const token = newToken();
		await db.update(list).set({ shareToken: token }).where(eq(list.id, l.id));
		expect(await outcome(() => (load as any)(fakeEvent({ params: { token } })))).toMatchObject({ kind: 'error', status: 404 });
	});
});
