import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { santaMember } from '#lib/server/db/schema';
import { load, actions } from '../../src/routes/(app-public)/santa/join/[token]/+page.server';
import { addSantaMember, createSanta, createUser, setDrawn } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const ev = (token: string, user: any = null, form?: Record<string, string>) =>
	fakeEvent({ user, params: { token }, path: `/santa/join/${token}`, form });

const isMember = async (santaId: string, userId: string) =>
	(await db.select().from(santaMember).where(and(eq(santaMember.santaId, santaId), eq(santaMember.userId, userId)))).length === 1;

describe('/santa/join/[token] load', () => {
	it('404s for an unknown token', async () => {
		expect(await outcome(() => load(ev('nope')))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('shows the invite to signed-out visitors without revealing emails', async () => {
		const org = await createUser({ name: 'Olive' });
		const m = await createUser({ name: 'Max' });
		const s = await createSanta(org, { name: 'Office', priceLimit: '15.00', exchangeDate: '2026-12-18', description: 'Fun' });
		await addSantaMember(s, m);
		const data = await ok<any>(() => load(ev(s.joinToken)));
		expect(data).toEqual({
			santa: { name: 'Office', description: 'Fun', budget: '£15', exchangeDate: '2026-12-18', drawn: false },
			organiserName: 'Olive',
			members: [{ id: m.id, name: 'Max' }]
		});
		expect(JSON.stringify(data)).not.toContain(m.email);
	});

	it('sends members and the organiser straight to the exchange', async () => {
		const org = await createUser();
		const m = await createUser();
		const s = await createSanta(org);
		await addSantaMember(s, m);
		for (const u of [org, m]) {
			expect(await outcome(() => load(ev(s.joinToken, u)))).toEqual({ kind: 'redirect', status: 303, location: `/santa/${s.id}` });
		}
		const newcomer = await createUser();
		expect(await outcome(() => load(ev(s.joinToken, newcomer)))).toMatchObject({ kind: 'ok' });
	});

	it('says when names are already drawn', async () => {
		const s = await createSanta(await createUser());
		await setDrawn(s, []);
		expect((await ok<any>(() => load(ev(s.joinToken)))).santa.drawn).toBe(true);
	});
});

describe('/santa/join/[token] action', () => {
	it('asks signed-out visitors to sign in first, coming back here', async () => {
		const s = await createSanta(await createUser());
		expect(await outcome(() => actions.default(ev(s.joinToken, null, {})))).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/signin?next=${encodeURIComponent(`/santa/join/${s.joinToken}`)}`
		});
	});

	it('404s for an unknown token', async () => {
		const me = await createUser();
		expect(await outcome(() => actions.default(ev('nope', me, {})))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('joins and opens the exchange (twice is harmless)', async () => {
		const s = await createSanta(await createUser());
		const me = await createUser();
		for (let i = 0; i < 2; i++) {
			expect(await outcome(() => actions.default(ev(s.joinToken, me, {})))).toEqual({
				kind: 'redirect',
				status: 303,
				location: `/santa/${s.id}`
			});
		}
		expect(await isMember(s.id, me.id)).toBe(true);
	});

	it('refuses to join after the draw', async () => {
		const s = await createSanta(await createUser());
		await setDrawn(s, []);
		const me = await createUser();
		expect(await outcome(() => actions.default(ev(s.joinToken, me, {})))).toMatchObject({ kind: 'error', status: 400 });
		expect(await isMember(s.id, me.id)).toBe(false);
	});
});
