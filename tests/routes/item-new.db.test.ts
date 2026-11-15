import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemList } from '#lib/server/db/schema';
import { load, actions } from '../../src/routes/(app)/items/new/+page.server';
import { addSantaMember, createList, createSanta, createUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const myItems = (userId: string) => db.select().from(item).where(eq(item.ownerId, userId));

describe('/items/new load', () => {
	it('has no target without ?list=', async () => {
		const me = await createUser();
		expect(await ok(() => load(fakeEvent({ user: me, path: '/items/new' })))).toEqual({ target: null });
	});

	it('targets my own list', async () => {
		const me = await createUser();
		const l = await createList(me, { title: 'Birthday' });
		const data = await ok<any>(() => load(fakeEvent({ user: me, path: `/items/new?list=${l.id}` })));
		expect(data.target).toEqual({ id: l.id, title: 'Birthday', santaLimit: null, currency: null });
	});

	it('ignores someone else’s list', async () => {
		const me = await createUser();
		const l = await createList(await createUser());
		expect(await ok(() => load(fakeEvent({ user: me, path: `/items/new?list=${l.id}` })))).toEqual({ target: null });
	});

	it('shows the Secret Santa budget for a Santa list', async () => {
		const org = await createUser();
		const me = await createUser();
		const s = await createSanta(org, { priceLimit: '20.00', currency: 'EUR' });
		const l = await addSantaMember(s, me);
		const data = await ok<any>(() => load(fakeEvent({ user: me, path: `/items/new?list=${l.id}` })));
		expect(data.target).toMatchObject({ id: l.id, santaLimit: '€20', currency: 'EUR' });
	});
});

describe('/items/new action', () => {
	it('validates the form', async () => {
		const me = await createUser();
		expect(await outcome(() => actions.default(fakeEvent({ user: me, path: '/items/new', form: { title: ' ' } })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: 'Give the wish a name.' }
		});
		expect(
			await outcome(() => actions.default(fakeEvent({ user: me, path: '/items/new', form: { title: 'Hat', price: 'lots' } })))
		).toMatchObject({ kind: 'fail', data: { error: 'Enter the price as a number, like 24.99.' } });
		expect(await myItems(me.id)).toEqual([]);
	});

	it('creates an item and opens it', async () => {
		const me = await createUser();
		const o = await outcome(() =>
			actions.default(
				fakeEvent({ user: me, path: '/items/new', form: { title: 'Scarf', notes: 'Grey', price: '£24.99', currency: 'usd', mostWanted: 'on' } })
			)
		);
		const [it] = await myItems(me.id);
		expect(it).toMatchObject({ title: 'Scarf', notes: 'Grey', price: '24.99', currency: 'USD', mostWanted: true });
		expect(o).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}` });
	});

	it('adds it to my list and keeps the list in the redirect', async () => {
		const me = await createUser();
		const l = await createList(me);
		const o = await outcome(() => actions.default(fakeEvent({ user: me, path: `/items/new?list=${l.id}`, form: { title: 'Lamp' } })));
		const [it] = await myItems(me.id);
		expect(o).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}?list=${l.id}` });
		expect(await db.select().from(itemList).where(eq(itemList.itemId, it.id))).toHaveLength(1);
	});

	it('ignores a list that is not mine', async () => {
		const me = await createUser();
		const foreign = await createList(await createUser());
		const o = await outcome(() =>
			actions.default(fakeEvent({ user: me, path: `/items/new?list=${foreign.id}`, form: { title: 'Lamp' } }))
		);
		const [it] = await myItems(me.id);
		expect(o).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}` });
		expect(await db.select().from(itemList).where(eq(itemList.listId, foreign.id))).toEqual([]);
	});

	it('refuses wishes over the Secret Santa budget, or in another currency', async () => {
		const org = await createUser();
		const me = await createUser();
		const s = await createSanta(org, { priceLimit: '20.00', currency: 'GBP' });
		const l = await addSantaMember(s, me);
		const path = `/items/new?list=${l.id}`;
		expect(await outcome(() => actions.default(fakeEvent({ user: me, path, form: { title: 'Big', price: '25' } })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { error: "That's over the £20 limit for this Secret Santa." }
		});
		expect(
			await outcome(() => actions.default(fakeEvent({ user: me, path, form: { title: 'Euro', price: '5', currency: 'EUR' } })))
		).toMatchObject({ kind: 'fail', data: { error: 'This Secret Santa uses GBP. Set the price in GBP.' } });
		expect(await myItems(me.id)).toEqual([]);

		// At the limit, and unpriced, are fine.
		expect(await outcome(() => actions.default(fakeEvent({ user: me, path, form: { title: 'Exact', price: '20' } })))).toMatchObject({
			kind: 'redirect'
		});
		expect(await outcome(() => actions.default(fakeEvent({ user: me, path, form: { title: 'Free' } })))).toMatchObject({ kind: 'redirect' });
		expect(await db.select().from(itemList).where(eq(itemList.listId, l.id))).toHaveLength(2);
	});
});
