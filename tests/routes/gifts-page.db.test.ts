import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { receivedFrom, receivedGift } from '#lib/server/db/schema';
import { load, actions } from '../../src/routes/(app)/gifts/+page.server';
import { claim, createContact, createItem, createList, createUser, share, view, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const revealedFor = async (ownerId: string) =>
	(await db.select().from(receivedFrom).where(eq(receivedFrom.ownerId, ownerId))).map((r) => r.giverId).sort();

/** An owner with a list shared to two friends, one of whom bought a wish and one reserved another. */
async function scene() {
	const me = await createUser({ name: 'Owner' });
	const ann = await createUser({ name: 'Ann' });
	const bob = await createUser({ name: 'Bob' });
	const l = await createList(me);
	await share(l, ann);
	await view(l, bob);
	const scarf = await createItem(me, { title: 'Scarf' }, { lists: [l] });
	const hat = await createItem(me, { title: 'Hat' }, { lists: [l] });
	await claim(scarf, ann, 'bought');
	await claim(hat, ann, 'buying');
	const socks = await createItem(me, { title: 'Socks' }, { lists: [l] });
	await claim(socks, bob, 'bought');
	return { me, ann, bob, l, scarf, hat, socks };
}

const ev = (me: TestUser, form?: Record<string, string>) => fakeEvent({ user: me, path: '/gifts', form });

describe('/gifts load', () => {
	it('shows the people I know and nothing bought until I mark received', async () => {
		const { me, ann, bob } = await scene();
		const contact = await createContact(me, 'Grandma Jo');
		const data = await ok<any>(() => load(ev(me)));
		expect(data.people).toEqual([
			{ id: ann.id, name: 'Ann' },
			{ id: bob.id, name: 'Bob' }
		]);
		expect(data.revealed).toEqual([]);
		expect(data.fromLists).toEqual([]);
		expect(data.noted).toEqual([]);
		expect(data.contacts).toEqual([contact]);
	});

	it('after marking received, shows that giver’s bought wishes but never their reservations', async () => {
		const { me, ann, scarf } = await scene();
		await ok(() => actions.received(ev(me, { giverId: ann.id })));
		const data = await ok<any>(() => load(ev(me)));
		expect(data.revealed).toEqual([ann.id]);
		expect(data.fromLists).toEqual([
			{
				kind: 'list',
				id: `${scarf.id}:${ann.id}`,
				itemId: scarf.id,
				claimerId: ann.id,
				title: 'Scarf',
				price: null,
				currency: 'GBP',
				cover: null,
				giverId: ann.id,
				reassigned: false
			}
		]);
	});
});

describe('/gifts received', () => {
	it('requires someone I know', async () => {
		const { me } = await scene();
		const stranger = await createUser();
		expect(await outcome(() => actions.received(ev(me, { giverId: stranger.id })))).toMatchObject({ kind: 'error', status: 400 });
		expect(await outcome(() => actions.received(ev(me, { giverId: '' })))).toMatchObject({ kind: 'error', status: 400 });
		expect(await revealedFor(me.id)).toEqual([]);
	});

	it('is idempotent', async () => {
		const { me, ann } = await scene();
		expect(await ok(() => actions.received(ev(me, { giverId: ann.id })))).toEqual({ done: true });
		expect(await ok(() => actions.received(ev(me, { giverId: ann.id })))).toEqual({ done: true });
		expect(await revealedFor(me.id)).toEqual([ann.id]);
	});
});

describe('/gifts receivedAll', () => {
	it('marks everyone I know as received, and reveals their bought wishes', async () => {
		const { me, ann, bob, scarf, socks } = await scene();
		await ok(() => actions.received(ev(me, { giverId: ann.id })));
		expect(await ok(() => actions.receivedAll(ev(me, {})))).toEqual({ done: true });
		expect(await revealedFor(me.id)).toEqual([ann.id, bob.id].sort());
		const data = await ok<any>(() => load(ev(me)));
		expect(data.fromLists.map((g: any) => g.itemId).sort()).toEqual([scarf.id, socks.id].sort());
	});

	it('does nothing when I know nobody', async () => {
		const me = await createUser();
		expect(await ok(() => actions.receivedAll(ev(me, {})))).toEqual({ done: true });
		expect(await revealedFor(me.id)).toEqual([]);
	});
});

describe('/gifts note actions', () => {
	it('noting a present from someone marks them received and records it', async () => {
		const { me, bob } = await scene();
		expect(await ok(() => actions.addGift(ev(me, { giverId: bob.id, title: 'Chocolates' })))).toEqual({ giftAdded: bob.id });
		expect(await revealedFor(me.id)).toEqual([bob.id]);
		const data = await ok<any>(() => load(ev(me)));
		expect(data.noted).toEqual([{ kind: 'noted', id: expect.any(String), title: 'Chocolates', giverId: bob.id }]);
	});

	it('adds a contact and can remove a noted present', async () => {
		const me = await createUser();
		const { contactAdded } = await ok<any>(() => actions.addContact(ev(me, { name: 'Aunt May', title: 'Jumper' })));
		const [g] = await db.select().from(receivedGift).where(and(eq(receivedGift.ownerId, me.id), eq(receivedGift.contactId, contactAdded)));
		expect(g.title).toBe('Jumper');
		expect(await ok(() => actions.removeGift(ev(me, { giftId: g.id })))).toEqual({ giftRemoved: true });
		expect(await db.select().from(receivedGift).where(eq(receivedGift.id, g.id))).toEqual([]);
	});
});

describe('/gifts thanked', () => {
	it('ticks and unticks thanks for an account holder and a contact', async () => {
		const { me, ann } = await scene();
		const jo = await createContact(me, 'Grandma Jo');
		expect(await ok(() => actions.thanked(ev(me, { personId: ann.id })))).toEqual({ thanked: { personId: ann.id, on: true } });
		await ok(() => actions.thanked(ev(me, { personId: jo.id })));
		await ok(() => actions.thanked(ev(me, { personId: jo.id }))); // idempotent
		expect(((await ok<any>(() => load(ev(me)))).thanked as string[]).sort()).toEqual([ann.id, jo.id].sort());

		await ok(() => actions.thanked(ev(me, { personId: ann.id, on: '0' })));
		expect((await ok<any>(() => load(ev(me)))).thanked).toEqual([jo.id]);
	});

	it('only accepts people I know, and is private to me', async () => {
		const { me, ann } = await scene();
		const stranger = await createUser();
		const someoneElsesContact = await createContact(ann, 'Not yours');
		for (const personId of [stranger.id, someoneElsesContact.id, '']) {
			expect(await outcome(() => actions.thanked(ev(me, { personId })))).toMatchObject({ kind: 'error', status: 400 });
		}
		await ok(() => actions.thanked(ev(me, { personId: ann.id })));
		expect((await ok<any>(() => load(ev(ann)))).thanked).toEqual([]);
	});

	it('does not reveal what someone bought', async () => {
		const { me, ann } = await scene();
		await ok(() => actions.thanked(ev(me, { personId: ann.id })));
		const data = await ok<any>(() => load(ev(me)));
		expect(data.revealed).toEqual([]);
		expect(data.fromLists).toEqual([]);
	});
});
