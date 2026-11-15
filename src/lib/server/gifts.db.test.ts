import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { giftAttribution, giftContact, receivedFrom, receivedGift } from './db/schema';
import { allReceived, contactsOf, getContact, giftNoteActions, giverOptions, personName, revealedGivers } from './gifts';
import {
	addImageRow,
	claim,
	createContact,
	createItem,
	createList,
	createUser,
	markReceived,
	share,
	type TestUser
} from '../../../tests/helpers/fixtures';
import { fakeEvent, outcome } from '../../../tests/helpers/event';

const act = (name: keyof typeof giftNoteActions, user: TestUser, form: Record<string, string>) =>
	outcome(() => giftNoteActions[name](fakeEvent({ user, form })));

/** Owner with a list shared with Sam and Priya (so both are "known people"). */
async function setup() {
	const [owner, sam, priya] = [await createUser(), await createUser({ name: 'Sam' }), await createUser({ name: 'Priya' })];
	const l = await createList(owner);
	await share(l, sam);
	await share(l, priya);
	return { owner, sam, priya, l };
}

const notedOf = (ownerId: string) => db.select().from(receivedGift).where(eq(receivedGift.ownerId, ownerId));
const attributionOf = async (itemId: string) =>
	(await db.select().from(giftAttribution).where(eq(giftAttribution.itemId, itemId)))[0] ?? null;

describe('revealedGivers', () => {
	it('lists the givers the owner marked received from', async () => {
		const { owner, sam } = await setup();
		expect(await revealedGivers(owner.id)).toEqual([]);
		await markReceived(owner, sam);
		expect(await revealedGivers(owner.id)).toEqual([sam.id]);
	});
});

describe('allReceived', () => {
	it('shows only bought wishes from revealed givers, never buying ones', async () => {
		const { owner, sam, priya, l } = await setup();
		const scarf = await createItem(owner, { title: 'Scarf', price: '20.00' }, { lists: [l] });
		const hat = await createItem(owner, { title: 'Hat' }, { lists: [l] });
		const mug = await createItem(owner, { title: 'Mug' }, { lists: [l] });
		await claim(scarf, sam, 'bought');
		await claim(hat, sam, 'buying');
		await claim(mug, priya, 'bought');
		expect((await allReceived(owner.id)).fromLists).toEqual([]);

		await markReceived(owner, sam);
		const cover = await addImageRow(scarf, 1);
		const { fromLists } = await allReceived(owner.id);
		expect(fromLists).toEqual([
			{
				kind: 'list',
				itemId: scarf.id,
				title: 'Scarf',
				price: '20.00',
				currency: 'GBP',
				cover: `/img/items/${scarf.id}/${cover}-thumb.webp`,
				giverId: sam.id,
				reassigned: false
			}
		]);
	});

	it('shows a reassigned wish as from the new giver, even if the claimer is not revealed', async () => {
		const { owner, sam, l } = await setup();
		const it = await createItem(owner, { title: 'Lamp' }, { lists: [l] });
		await claim(it, sam, 'bought');
		const c = await createContact(owner, 'Granny');
		await db.insert(giftAttribution).values({ itemId: it.id, ownerId: owner.id, contactId: c.id });
		expect((await allReceived(owner.id)).fromLists).toEqual([
			expect.objectContaining({ itemId: it.id, giverId: c.id, reassigned: true, cover: null })
		]);
	});

	it('includes presents the owner noted, in the order they were noted', async () => {
		const { owner, sam } = await setup();
		const c = await createContact(owner);
		await act('addGift', owner, { giverId: sam.id, title: 'Socks' });
		await act('addGift', owner, { contactId: c.id, title: 'Jam' });
		const { noted } = await allReceived(owner.id);
		expect(noted.map((n) => [n.title, n.giverId, n.kind])).toEqual([
			['Socks', sam.id, 'noted'],
			['Jam', c.id, 'noted']
		]);
	});
});

describe('contacts', () => {
	it('lists only my contacts, A–Z, and getContact is scoped to the owner', async () => {
		const [me, other] = [await createUser(), await createUser()];
		const b = await createContact(me, 'Bea');
		const a = await createContact(me, 'Al');
		const theirs = await createContact(other, 'Zoe');
		expect(await contactsOf(me.id)).toEqual([a, b]);
		expect(await getContact(me.id, a.id)).toEqual(a);
		expect(await getContact(me.id, theirs.id)).toBeNull();
	});

	it('giverOptions lists known accounts, then contacts', async () => {
		const { owner, sam, priya } = await setup();
		const c = await createContact(owner, 'Aunt May');
		expect(await giverOptions(owner.id)).toEqual([
			{ id: priya.id, name: 'Priya', isContact: false },
			{ id: sam.id, name: 'Sam', isContact: false },
			{ id: c.id, name: 'Aunt May', isContact: true }
		]);
	});

	it('personName looks up a display name', async () => {
		const u = await createUser({ name: 'Nia' });
		expect(await personName(u.id)).toBe('Nia');
		expect(await personName('missing')).toBeNull();
	});
});

describe('giftNoteActions.addGift', () => {
	it('notes a present from a known account and marks them received', async () => {
		const { owner, sam } = await setup();
		expect(await act('addGift', owner, { giverId: sam.id, title: '  Socks ' })).toEqual({ kind: 'ok', data: { giftAdded: sam.id } });
		expect(await notedOf(owner.id)).toEqual([expect.objectContaining({ giverId: sam.id, contactId: null, title: 'Socks' })]);
		expect(await revealedGivers(owner.id)).toEqual([sam.id]);
		// Doing it again doesn't trip over the existing received_from row.
		expect(await act('addGift', owner, { giverId: sam.id, title: 'Book' })).toMatchObject({ kind: 'ok' });
	});

	it('notes a present from a contact', async () => {
		const { owner } = await setup();
		const c = await createContact(owner);
		expect(await act('addGift', owner, { contactId: c.id, title: 'Jam' })).toEqual({ kind: 'ok', data: { giftAdded: c.id } });
		expect(await notedOf(owner.id)).toEqual([expect.objectContaining({ giverId: null, contactId: c.id })]);
	});

	it('validates the title', async () => {
		const { owner, sam } = await setup();
		expect(await act('addGift', owner, { giverId: sam.id, title: ' ' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { giftError: { giverId: sam.id, message: 'Write what they gave you.' } }
		});
		expect(await act('addGift', owner, { giverId: sam.id, title: 'x'.repeat(201) })).toMatchObject({
			kind: 'fail',
			data: { giftError: { message: 'Keep it under 200 characters.' } }
		});
		expect(await notedOf(owner.id)).toEqual([]);
	});

	it('refuses strangers, other people’s contacts, and no giver at all', async () => {
		const { owner } = await setup();
		const stranger = await createUser();
		const theirContact = await createContact(stranger);
		expect(await act('addGift', owner, { giverId: stranger.id, title: 'X' })).toMatchObject({ kind: 'error', status: 400 });
		expect(await act('addGift', owner, { contactId: theirContact.id, title: 'X' })).toMatchObject({ kind: 'error', status: 404 });
		expect(await act('addGift', owner, { title: 'X' })).toMatchObject({ kind: 'error', status: 400 });
		expect(await notedOf(owner.id)).toEqual([]);
		expect(await revealedGivers(owner.id)).toEqual([]);
	});
});

describe('giftNoteActions.removeGift', () => {
	it('removes only my own noted presents', async () => {
		const { owner, sam } = await setup();
		await act('addGift', owner, { giverId: sam.id, title: 'Socks' });
		const [g] = await notedOf(owner.id);
		const other = await createUser();
		await act('removeGift', other, { giftId: g.id });
		expect(await notedOf(owner.id)).toHaveLength(1);
		expect(await act('removeGift', owner, { giftId: g.id })).toEqual({ kind: 'ok', data: { giftRemoved: true } });
		expect(await notedOf(owner.id)).toEqual([]);
	});
});

describe('giftNoteActions.addContact', () => {
	it('adds a contact, optionally with a first present', async () => {
		const me = await createUser();
		const res = await act('addContact', me, { name: ' Grandma Jo ', title: 'Jumper' });
		expect(res.kind).toBe('ok');
		const id = (res as { data: { contactAdded: string } }).data.contactAdded;
		expect(await contactsOf(me.id)).toEqual([{ id, name: 'Grandma Jo' }]);
		expect(await notedOf(me.id)).toEqual([expect.objectContaining({ contactId: id, title: 'Jumper' })]);
	});

	it('reuses an existing contact whose name differs only in case', async () => {
		const me = await createUser();
		const c = await createContact(me, 'Grandma Jo');
		expect(await act('addContact', me, { name: 'grandma jo' })).toEqual({ kind: 'ok', data: { contactAdded: c.id } });
		expect(await contactsOf(me.id)).toEqual([{ id: c.id, name: 'Grandma Jo' }]);
	});

	it('validates name and title', async () => {
		const me = await createUser();
		expect(await act('addContact', me, { name: '' })).toEqual({ kind: 'fail', status: 400, data: { contactError: 'Add their name.' } });
		expect(await act('addContact', me, { name: 'x'.repeat(81) })).toMatchObject({
			data: { contactError: 'Keep the name under 80 characters.' }
		});
		expect(await act('addContact', me, { name: 'Jo', title: 'x'.repeat(201) })).toMatchObject({
			data: { contactError: 'Keep it under 200 characters.' }
		});
		expect(await contactsOf(me.id)).toEqual([]);
	});

	it('two owners can each have a contact with the same name', async () => {
		const [a, b] = [await createUser(), await createUser()];
		await act('addContact', a, { name: 'Mum' });
		await act('addContact', b, { name: 'Mum' });
		expect(await contactsOf(a.id)).toHaveLength(1);
		expect(await contactsOf(b.id)).toHaveLength(1);
	});
});

describe('giftNoteActions.reassign', () => {
	async function boughtBySam() {
		const s = await setup();
		const it = await createItem(s.owner, { title: 'Scarf' }, { lists: [s.l] });
		await claim(it, s.sam, 'bought');
		await markReceived(s.owner, s.sam);
		return { ...s, it };
	}

	it('moves a bought wish to another account without touching the claim', async () => {
		const { owner, sam, priya, it } = await boughtBySam();
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: priya.id })).toEqual({ kind: 'ok', data: { reassigned: it.id } });
		expect(await attributionOf(it.id)).toMatchObject({ ownerId: owner.id, giverId: priya.id, contactId: null });
		const [g] = (await allReceived(owner.id)).fromLists;
		expect(g).toMatchObject({ giverId: priya.id, reassigned: true });
		const { itemClaim } = await import('./db/schema');
		expect((await db.select().from(itemClaim).where(eq(itemClaim.itemId, it.id)))[0]).toMatchObject({ userId: sam.id });
	});

	it('moves a bought wish to a contact, and to a brand new contact', async () => {
		const { owner, it } = await boughtBySam();
		const c = await createContact(owner, 'Granny');
		await act('reassign', owner, { kind: 'list', id: it.id, to: c.id });
		expect(await attributionOf(it.id)).toMatchObject({ giverId: null, contactId: c.id });

		await act('reassign', owner, { kind: 'list', id: it.id, to: 'new', newName: 'Uncle Bob' });
		const bob = (await contactsOf(owner.id)).find((x) => x.name === 'Uncle Bob')!;
		expect(await attributionOf(it.id)).toMatchObject({ giverId: null, contactId: bob.id });

		// 'new' with an existing name reuses that contact.
		await act('reassign', owner, { kind: 'list', id: it.id, to: 'new', newName: 'granny' });
		expect(await attributionOf(it.id)).toMatchObject({ contactId: c.id });
		expect(await contactsOf(owner.id)).toHaveLength(2);
	});

	it('moving it back to the person who claimed it removes the correction', async () => {
		const { owner, sam, priya, it } = await boughtBySam();
		await act('reassign', owner, { kind: 'list', id: it.id, to: priya.id });
		await act('reassign', owner, { kind: 'list', id: it.id, to: sam.id });
		expect(await attributionOf(it.id)).toBeNull();
		expect((await allReceived(owner.id)).fromLists[0]).toMatchObject({ giverId: sam.id, reassigned: false });
	});

	it('404s for a present the owner cannot see yet', async () => {
		const { owner, priya, l } = await setup();
		const it = await createItem(owner, {}, { lists: [l] });
		await claim(it, priya, 'bought');
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: priya.id })).toMatchObject({ kind: 'error', status: 404 });
		expect(await attributionOf(it.id)).toBeNull();
	});

	it('rejects an unknown kind, an unknown target, and a missing new name', async () => {
		const { owner, priya, it } = await boughtBySam();
		expect(await act('reassign', owner, { kind: 'other', id: it.id, to: priya.id })).toMatchObject({ kind: 'error', status: 400 });
		const stranger = await createUser();
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: stranger.id })).toEqual({
			kind: 'fail',
			status: 400,
			data: { reassignError: { id: it.id, message: 'Pick who it was from.' } }
		});
		const theirContact = await createContact(stranger);
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: theirContact.id })).toMatchObject({ kind: 'fail' });
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: 'new', newName: ' ' })).toMatchObject({
			data: { reassignError: { message: 'Add their name.' } }
		});
		expect(await act('reassign', owner, { kind: 'list', id: it.id, to: 'new', newName: 'x'.repeat(81) })).toMatchObject({
			data: { reassignError: { message: 'Keep the name under 80 characters.' } }
		});
		expect(await attributionOf(it.id)).toBeNull();
	});

	it('changes who a noted present was from, only for its owner', async () => {
		const { owner, sam, priya } = await setup();
		await act('addGift', owner, { giverId: sam.id, title: 'Socks' });
		const [g] = await notedOf(owner.id);
		const c = await createContact(owner);
		expect(await act('reassign', owner, { kind: 'noted', id: g.id, to: c.id })).toEqual({ kind: 'ok', data: { reassigned: g.id } });
		expect((await notedOf(owner.id))[0]).toMatchObject({ giverId: null, contactId: c.id });
		await act('reassign', owner, { kind: 'noted', id: g.id, to: priya.id });
		expect((await notedOf(owner.id))[0]).toMatchObject({ giverId: priya.id, contactId: null });

		// Someone else can't change it, even pointing at their own contact.
		const other = await createUser();
		const otherContact = await createContact(other);
		await act('reassign', other, { kind: 'noted', id: g.id, to: otherContact.id });
		expect((await notedOf(owner.id))[0]).toMatchObject({ giverId: priya.id });
	});
});

describe('giftNoteActions.renameContact', () => {
	it('renames my contact', async () => {
		const me = await createUser();
		const c = await createContact(me, 'Gran');
		expect(await act('renameContact', me, { contactId: c.id, name: ' Granny ' })).toEqual({ kind: 'ok', data: { renamed: true } });
		expect(await getContact(me.id, c.id)).toEqual({ id: c.id, name: 'Granny' });
	});

	it('validates the name and refuses a duplicate', async () => {
		const me = await createUser();
		const c = await createContact(me, 'Gran');
		await createContact(me, 'Mum');
		expect(await act('renameContact', me, { contactId: c.id, name: '' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { renameError: 'Add their name.' }
		});
		expect(await act('renameContact', me, { contactId: c.id, name: 'x'.repeat(81) })).toMatchObject({
			data: { renameError: 'Keep the name under 80 characters.' }
		});
		expect(await act('renameContact', me, { contactId: c.id, name: 'MUM' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { renameError: 'You already have someone called MUM.' }
		});
		expect(await getContact(me.id, c.id)).toEqual({ id: c.id, name: 'Gran' });
	});

	it("404s for someone else's contact", async () => {
		const [me, other] = [await createUser(), await createUser()];
		const c = await createContact(other, 'Gran');
		expect(await act('renameContact', me, { contactId: c.id, name: 'Hacked' })).toMatchObject({ kind: 'error', status: 404 });
		expect(await getContact(other.id, c.id)).toEqual({ id: c.id, name: 'Gran' });
	});
});

describe('received_from rows', () => {
	it('are per owner', async () => {
		const { owner, sam } = await setup();
		await act('addGift', owner, { giverId: sam.id, title: 'Socks' });
		const rows = await db.select().from(receivedFrom).where(and(eq(receivedFrom.ownerId, owner.id), eq(receivedFrom.giverId, sam.id)));
		expect(rows).toHaveLength(1);
		expect(await revealedGivers(sam.id)).toEqual([]);
		expect(await db.select().from(giftContact).where(eq(giftContact.ownerId, owner.id))).toEqual([]);
	});
});
