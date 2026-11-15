import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list, santa, santaMember } from '#lib/server/db/schema';
import { actions } from '../../src/routes/(app)/santa/new/+page.server';
import { load as indexLoad } from '../../src/routes/(app)/santa/+page.server';
import { addSantaMember, createSanta, createUser, setDrawn, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const ev = (me: TestUser, form: Record<string, string>) => fakeEvent({ user: me, path: '/santa/new', form });
const santasOf = (userId: string) => db.select().from(santa).where(eq(santa.ownerId, userId));

describe('/santa/new', () => {
	it.each([
		[{ name: '' }, 'Give your Secret Santa a name.'],
		[{ name: 'x'.repeat(121) }, 'Keep the name under 120 characters.'],
		[{ name: 'Office', priceLimit: 'twenty' }, 'Enter the budget as a number, like 20.'],
		[{ name: 'Office', exchangeDate: '25/12/2026' }, 'Pick a valid date.']
	])('rejects %j', async (form, message) => {
		const me = await createUser();
		expect(await outcome(() => actions.default(ev(me, form)))).toEqual({ kind: 'fail', status: 400, data: { error: message } });
		expect(await santasOf(me.id)).toEqual([]);
	});

	it('creates an exchange the organiser isn’t playing in', async () => {
		const me = await createUser();
		const o = await outcome(() =>
			actions.default(ev(me, { name: 'Office', priceLimit: '£20', currency: 'eur', exchangeDate: '2026-12-20', description: 'Be nice' }))
		);
		const [s] = await santasOf(me.id);
		expect(o).toEqual({ kind: 'redirect', status: 303, location: `/santa/${s.id}` });
		expect(s).toMatchObject({
			name: 'Office',
			priceLimit: '20.00',
			currency: 'EUR',
			exchangeDate: '2026-12-20',
			description: 'Be nice',
			status: 'open'
		});
		expect(s.joinToken).toHaveLength(40);
		expect(await db.select().from(santaMember).where(eq(santaMember.santaId, s.id))).toEqual([]);
	});

	it('joins the organiser when they are playing, creating their Santa list', async () => {
		const me = await createUser();
		await outcome(() => actions.default(ev(me, { name: 'Family', playing: 'on' })));
		const [s] = await santasOf(me.id);
		const [m] = await db.select().from(santaMember).where(eq(santaMember.santaId, s.id));
		expect(m.userId).toBe(me.id);
		const [l] = await db.select().from(list).where(eq(list.id, m.listId!));
		expect(l).toMatchObject({ ownerId: me.id, title: 'Family', santaId: s.id, visibility: 'private' });
	});
});

describe('/santa index', () => {
	it('lists exchanges I organise or play in, with my recipient once drawn', async () => {
		const me = await createUser();
		const [org, b, c] = [await createUser(), await createUser({ name: 'Bea' }), await createUser()];
		const organised = await createSanta(me, { name: 'Mine', priceLimit: '10.00' });
		const playing = await createSanta(org, { name: 'Theirs' });
		await addSantaMember(playing, me);
		const bList = await addSantaMember(playing, b);
		await addSantaMember(playing, c);
		await setDrawn(playing, [
			[me, b],
			[b, c],
			[c, me]
		]);
		await createSanta(org, { name: 'Not mine' });

		const { santas } = await ok<any>(() => indexLoad(fakeEvent({ user: me, path: '/santa' })));
		expect(santas.map((s: any) => s.id).sort()).toEqual([organised.id, playing.id].sort());
		expect(santas.find((s: any) => s.id === organised.id)).toMatchObject({
			isOrganiser: true,
			isMember: false,
			memberCount: 0,
			budget: '£10',
			recipient: null
		});
		expect(santas.find((s: any) => s.id === playing.id)).toMatchObject({
			isOrganiser: false,
			isMember: true,
			memberCount: 3,
			status: 'drawn',
			recipient: { name: 'Bea', listId: bList.id }
		});
	});
});
