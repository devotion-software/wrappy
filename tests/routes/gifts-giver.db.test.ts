import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { giftContact, receivedGift } from '#lib/server/db/schema';
import { newId } from '#lib/server/ids';
import { load, actions } from '../../src/routes/(app)/gifts/[giverId]/+page.server';
import { claim, createContact, createItem, createList, createUser, markReceived, share, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const ev = (me: TestUser, giverId: string, form?: Record<string, string>) =>
	fakeEvent({ user: me, params: { giverId }, path: `/gifts/${giverId}`, form });

async function noteGift(owner: { id: string }, giver: { giverId?: string; contactId?: string }, title: string) {
	const id = newId();
	await db.insert(receivedGift).values({ id, ownerId: owner.id, title, giverId: giver.giverId ?? null, contactId: giver.contactId ?? null });
	return id;
}

async function scene() {
	const me = await createUser({ name: 'Owner' });
	const ann = await createUser({ name: 'Ann' });
	const bob = await createUser({ name: 'Bob' });
	const l = await createList(me);
	await share(l, ann);
	await share(l, bob);
	const jo = await createContact(me, 'Grandma Jo');
	return { me, ann, bob, l, jo };
}

describe('/gifts/[giverId] load', () => {
	it('404s for someone I don’t know, or someone else’s contact', async () => {
		const { me } = await scene();
		const stranger = await createUser();
		const theirContact = await createContact(stranger, 'Not yours');
		expect(await outcome(() => load(ev(me, stranger.id)))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => load(ev(me, theirContact.id)))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('shows an account holder, not yet received', async () => {
		const { me, ann, bob, jo, l } = await scene();
		const it = await createItem(me, { title: 'Scarf' }, { lists: [l] });
		await claim(it, ann, 'bought');
		const data = await ok<any>(() => load(ev(me, ann.id)));
		expect(data.person).toEqual({ id: ann.id, name: 'Ann', isContact: false });
		expect(data.received).toBe(false);
		expect(data.fromLists).toEqual([]);
		expect(data.others.map((o: any) => o.id)).toEqual([bob.id, jo.id]);
	});

	it('once received, shows only that person’s presents', async () => {
		const { me, ann, bob, l } = await scene();
		const scarf = await createItem(me, { title: 'Scarf' }, { lists: [l] });
		const hat = await createItem(me, { title: 'Hat' }, { lists: [l] });
		await claim(scarf, ann, 'bought');
		await claim(hat, bob, 'bought');
		await markReceived(me, ann);
		await markReceived(me, bob);
		await noteGift(me, { giverId: ann.id }, 'Card');
		await noteGift(me, { giverId: bob.id }, 'Mug');
		const data = await ok<any>(() => load(ev(me, ann.id)));
		expect(data.received).toBe(true);
		expect(data.fromLists.map((g: any) => g.itemId)).toEqual([scarf.id]);
		expect(data.noted.map((g: any) => g.title)).toEqual(['Card']);
	});

	it('shows a contact as always received, with their noted presents', async () => {
		const { me, jo, ann, bob } = await scene();
		await noteGift(me, { contactId: jo.id }, 'Socks');
		const data = await ok<any>(() => load(ev(me, jo.id)));
		expect(data.person).toEqual({ id: jo.id, name: 'Grandma Jo', isContact: true });
		expect(data.received).toBe(true);
		expect(data.noted.map((g: any) => g.title)).toEqual(['Socks']);
		expect(data.others.map((o: any) => o.id)).toEqual([ann.id, bob.id]);
	});
});

describe('/gifts/[giverId] deleteContact', () => {
	it('removes my contact and their noted presents, then goes to /gifts', async () => {
		const { me, jo, ann } = await scene();
		const fromJo = await noteGift(me, { contactId: jo.id }, 'Socks');
		const fromAnn = await noteGift(me, { giverId: ann.id }, 'Card');
		expect(await outcome(() => actions.deleteContact(ev(me, jo.id, {})))).toEqual({ kind: 'redirect', status: 303, location: '/gifts' });
		expect(await db.select().from(giftContact).where(eq(giftContact.id, jo.id))).toEqual([]);
		expect(await db.select().from(receivedGift).where(eq(receivedGift.id, fromJo))).toEqual([]);
		expect(await db.select().from(receivedGift).where(eq(receivedGift.id, fromAnn))).toHaveLength(1);
	});

	it('cannot delete someone else’s contact', async () => {
		const me = await createUser();
		const other = await createUser();
		const theirs = await createContact(other, 'Keep me');
		expect(await outcome(() => actions.deleteContact(ev(me, theirs.id, {})))).toMatchObject({ kind: 'redirect' });
		expect(await db.select().from(giftContact).where(eq(giftContact.id, theirs.id))).toHaveLength(1);
	});

	it('exposes the shared note actions', async () => {
		const { me, jo } = await scene();
		expect(await ok(() => actions.renameContact(ev(me, jo.id, { contactId: jo.id, name: 'Nana Jo' })))).toEqual({ renamed: true });
		expect((await db.select().from(giftContact).where(eq(giftContact.id, jo.id)))[0].name).toBe('Nana Jo');
	});
});
