import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { itemClaim, list, listExtra, listOccasion } from '#lib/server/db/schema';
import { claim, createItem, createList, createUser, markReceived, share, view, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

vi.mock('#lib/server/email', () => ({
	sendListInviteEmail: vi.fn(async () => {}),
	sendOtpEmail: vi.fn(async () => {}),
	sendSantaAssignmentEmail: vi.fn(async () => {})
}));

import { load as listLoad, actions as listActions } from '../../src/routes/(app-public)/lists/[id]/+page.server';
import { load as giftsLoad, actions as giftsActions } from '../../src/routes/(app)/gifts/+page.server';

const act = (name: keyof typeof listActions, user: TestUser | null, l: { id: string }, form: Record<string, string> = {}) =>
	outcome(() => (listActions[name] as any)(fakeEvent({ user, params: { id: l.id }, form, path: `/lists/${l.id}` })));
const loadList = (user: TestUser | null, l: { id: string }) => ok<any>(() => (listLoad as any)(fakeEvent({ user, params: { id: l.id } })));
const loadGifts = (user: TestUser) => ok<any>(() => (giftsLoad as any)(fakeEvent({ user, path: '/gifts' })));

async function occasionsOf(l: { id: string }) {
	return db.select().from(listOccasion).where(eq(listOccasion.listId, l.id)).orderBy(listOccasion.occasionDate);
}

/** Meg's list for her birthday (12 Dec) and Christmas (25 Dec), shared with Sam and Ann. */
async function scene() {
	const meg = await createUser({ name: 'Meg' });
	const sam = await createUser({ name: 'Sam' });
	const ann = await createUser({ name: 'Ann' });
	const l = await createList(meg, { title: 'Birthday and Christmas' });
	await share(l, sam);
	await share(l, ann);
	await view(l, sam);
	await view(l, ann);
	expect((await act('addOccasion', meg, l, { name: 'Birthday', date: '2099-12-12' })).kind).toBe('ok');
	expect((await act('addOccasion', meg, l, { name: 'Christmas', date: '2099-12-25' })).kind).toBe('ok');
	const [bday, xmas] = await occasionsOf(l);
	const scarf = await createItem(meg, { title: 'Scarf' }, { lists: [l] });
	const book = await createItem(meg, { title: 'Book' }, { lists: [l] });
	return { meg, sam, ann, l, bday, xmas, scarf, book };
}

describe('occasions', () => {
	it('keeps the list date at the last occasion', async () => {
		const { l } = await scene();
		const [row] = await db.select().from(list).where(eq(list.id, l.id));
		expect(row.eventDate).toBe('2099-12-25');
	});

	it('checks the occasion form and stops duplicates', async () => {
		const { meg, l } = await scene();
		expect(await act('addOccasion', meg, l, { name: '', date: '2099-01-01' })).toMatchObject({ kind: 'fail' });
		expect(await act('addOccasion', meg, l, { name: 'Easter', date: 'soon' })).toMatchObject({ kind: 'fail' });
		expect(await act('addOccasion', meg, l, { name: 'birthday', date: '2099-01-01' })).toMatchObject({ kind: 'fail' });
	});

	it('only lets the owner manage occasions', async () => {
		const { sam, l } = await scene();
		expect(await act('addOccasion', sam, l, { name: 'Easter', date: '2099-04-01' })).toMatchObject({ kind: 'error', status: 404 });
	});

	it('needs guests to say which occasion when there is a choice', async () => {
		const { sam, l, scarf, xmas } = await scene();
		const r = await act('claim', sam, l, { itemId: scarf.id });
		expect(r).toMatchObject({ kind: 'fail', data: { claimError: { itemId: scarf.id } } });
		expect((await act('claim', sam, l, { itemId: scarf.id, occasionId: xmas.id })).kind).toBe('ok');
		const [c] = await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id));
		expect(c.occasionId).toBe(xmas.id);
	});

	it('rejects an occasion from another list', async () => {
		const { sam, l, scarf, meg } = await scene();
		const other = await createList(meg);
		await act('addOccasion', meg, other, { name: 'Easter', date: '2099-04-01' });
		const [easter] = await occasionsOf(other);
		expect(await act('claim', sam, l, { itemId: scarf.id, occasionId: easter.id })).toMatchObject({ kind: 'fail' });
	});

	it('opening the birthday shows birthday presents and keeps Christmas hidden, even after "received from"', async () => {
		const { meg, sam, l, bday, xmas, scarf, book } = await scene();
		await act('claim', sam, l, { itemId: scarf.id, occasionId: bday.id });
		await act('bought', sam, l, { itemId: scarf.id });
		await act('claim', sam, l, { itemId: book.id, occasionId: xmas.id });
		await act('bought', sam, l, { itemId: book.id });
		await markReceived(meg, sam);

		let data = await loadList(meg, l);
		expect(data.items.every((i: any) => i.claims.others.length === 0)).toBe(true);
		expect((await loadGifts(meg)).fromLists).toEqual([]);

		expect((await act('openOccasion', meg, l, { occasionId: bday.id })).kind).toBe('ok');
		data = await loadList(meg, l);
		const byTitle = Object.fromEntries(data.items.map((i: any) => [i.title, i.claims.others]));
		expect(byTitle.Scarf).toEqual([{ status: 'bought', byName: 'Sam' }]);
		expect(byTitle.Book).toEqual([]);
		const gifts = await loadGifts(meg);
		expect(gifts.fromLists.map((g: any) => g.title)).toEqual(['Scarf']);
		expect(gifts.occasions.map((o: any) => [o.name, o.opened])).toEqual([
			['Birthday', true],
			['Christmas', false]
		]);

		// Opening Christmas from the Presents received page shows the rest.
		await ok(() => (giftsActions.openOccasion as any)(fakeEvent({ user: meg, path: '/gifts', form: { occasionId: xmas.id } })));
		expect((await loadGifts(meg)).fromLists.map((g: any) => g.title).sort()).toEqual(['Book', 'Scarf']);
	});

	it("can't open someone else's occasion", async () => {
		const { sam, bday } = await scene();
		const r = await outcome(() => (giftsActions.openOccasion as any)(fakeEvent({ user: sam, path: '/gifts', form: { occasionId: bday.id } })));
		expect(r).toMatchObject({ kind: 'error', status: 404 });
	});

	it('lets a guest move their present to another occasion until it is opened', async () => {
		const { meg, sam, l, bday, xmas, scarf } = await scene();
		await act('claim', sam, l, { itemId: scarf.id, occasionId: bday.id });
		expect((await act('setOccasion', sam, l, { itemId: scarf.id, occasionId: xmas.id })).kind).toBe('ok');
		await act('setOccasion', sam, l, { itemId: scarf.id, occasionId: bday.id });
		await act('openOccasion', meg, l, { occasionId: bday.id });
		expect(await act('setOccasion', sam, l, { itemId: scarf.id, occasionId: xmas.id })).toMatchObject({ kind: 'fail' });
		const [c] = await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id));
		expect(c.occasionId).toBe(bday.id);
	});

	it('lets the owner rename and re-date an occasion, keeping its presents', async () => {
		const { meg, sam, l, bday, xmas, scarf } = await scene();
		await act('claim', sam, l, { itemId: scarf.id, occasionId: xmas.id });
		expect((await act('updateOccasion', meg, l, { occasionId: xmas.id, name: 'New Year', date: '2100-01-01' })).kind).toBe('ok');
		const [, row] = await occasionsOf(l);
		expect(row).toMatchObject({ id: xmas.id, name: 'New Year', occasionDate: '2100-01-01' });
		const [c] = await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id));
		expect(c.occasionId).toBe(xmas.id);
		// The list date follows the last occasion.
		expect((await db.select().from(list).where(eq(list.id, l.id)))[0].eventDate).toBe('2100-01-01');
		// Same checks as adding: a name, a date, no duplicates (keeping its own name is fine).
		expect(await act('updateOccasion', meg, l, { occasionId: bday.id, name: '', date: '2099-12-12' })).toMatchObject({ kind: 'fail' });
		expect(await act('updateOccasion', meg, l, { occasionId: bday.id, name: 'Birthday', date: 'soon' })).toMatchObject({ kind: 'fail' });
		expect(await act('updateOccasion', meg, l, { occasionId: bday.id, name: 'new year', date: '2099-12-12' })).toMatchObject({ kind: 'fail' });
		expect((await act('updateOccasion', meg, l, { occasionId: bday.id, name: 'Birthday', date: '2099-12-13' })).kind).toBe('ok');
	});

	it('only the owner can edit an occasion, and only on their own list', async () => {
		const { meg, sam, l, bday } = await scene();
		expect(await act('updateOccasion', sam, l, { occasionId: bday.id, name: 'Mine', date: '2099-01-01' })).toMatchObject({ kind: 'error', status: 404 });
		const other = await createList(meg);
		expect(await act('updateOccasion', meg, other, { occasionId: bday.id, name: 'Moved', date: '2099-01-01' })).toMatchObject({ kind: 'error', status: 404 });
	});

	it('removing an occasion moves its presents to another unopened one, and the last one stays', async () => {
		const { meg, sam, l, bday, xmas, scarf } = await scene();
		await act('claim', sam, l, { itemId: scarf.id, occasionId: bday.id });
		expect((await act('removeOccasion', meg, l, { occasionId: bday.id })).kind).toBe('ok');
		const [c] = await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id));
		expect(c.occasionId).toBe(xmas.id);
		expect(await act('removeOccasion', meg, l, { occasionId: xmas.id })).toMatchObject({ kind: 'fail' });
	});

	it('shows guests which occasion a present is for', async () => {
		const { sam, ann, l, xmas, scarf } = await scene();
		await act('claim', sam, l, { itemId: scarf.id, occasionId: xmas.id });
		const data = await loadList(ann, l);
		const scarfRow = data.items.find((i: any) => i.id === scarf.id);
		expect(scarfRow.claims.others[0].occasionId).toBe(xmas.id);
		expect(data.occasionNames[xmas.id]).toBe('Christmas');
		expect(data.suggestedOccasion).toBe(data.occasions[0].id);
	});

	it('claims without an occasion pick the only one left', async () => {
		const { meg, sam, l, bday, scarf } = await scene();
		await act('openOccasion', meg, l, { occasionId: bday.id });
		expect((await act('bought', sam, l, { itemId: scarf.id })).kind).toBe('ok');
		const [c] = await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id));
		expect(c.occasionId).not.toBe(bday.id);
		expect(c.occasionId).not.toBeNull();
	});
});

describe('presents not on the list', () => {
	it('shows them to other guests but never to the owner', async () => {
		const { meg, sam, ann, l, xmas } = await scene();
		expect((await act('addExtra', sam, l, { title: 'Matching gloves', occasionId: xmas.id })).kind).toBe('ok');

		const forAnn = await loadList(ann, l);
		expect(forAnn.extras).toEqual([
			expect.objectContaining({ title: 'Matching gloves', byName: 'Sam', mine: false, occasionId: xmas.id })
		]);
		expect((await loadList(sam, l)).extras[0].mine).toBe(true);

		const forMeg = await loadList(meg, l);
		expect(forMeg.extras).toEqual([]);
		expect(JSON.stringify(forMeg)).not.toContain('Matching gloves');
		expect((await loadList(null, l).catch(() => null))?.extras ?? []).toEqual([]);
	});

	it('only the person who added one can remove it', async () => {
		const { sam, ann, l, xmas } = await scene();
		await act('addExtra', sam, l, { title: 'Gloves', occasionId: xmas.id });
		const [x] = await db.select().from(listExtra).where(eq(listExtra.listId, l.id));
		await act('removeExtra', ann, l, { extraId: x.id });
		expect(await db.select().from(listExtra).where(eq(listExtra.listId, l.id))).toHaveLength(1);
		await act('removeExtra', sam, l, { extraId: x.id });
		expect(await db.select().from(listExtra).where(eq(listExtra.listId, l.id))).toHaveLength(0);
	});

	it('the owner and people without access cannot add them', async () => {
		const { meg, l } = await scene();
		expect(await act('addExtra', meg, l, { title: 'Gloves' })).toMatchObject({ kind: 'error', status: 403 });
		const stranger = await createUser();
		expect(await act('addExtra', stranger, l, { title: 'Gloves' })).toMatchObject({ kind: 'error', status: 404 });
		expect(await act('addExtra', null, l, { title: 'Gloves' })).toMatchObject({ kind: 'redirect' });
	});

	it('needs a title and an occasion when the list has a choice', async () => {
		const { sam, l } = await scene();
		expect(await act('addExtra', sam, l, { title: '  ' })).toMatchObject({ kind: 'fail' });
		expect(await act('addExtra', sam, l, { title: 'Gloves' })).toMatchObject({ kind: 'fail' });
	});

	it('turns up in Presents received once revealed', async () => {
		const meg = await createUser({ name: 'Meg' });
		const sam = await createUser({ name: 'Sam' });
		const l = await createList(meg);
		await share(l, sam);
		await view(l, sam);
		await act('addExtra', sam, l, { title: 'Gloves' });
		expect((await loadGifts(meg)).extras).toEqual([]);
		await markReceived(meg, sam);
		expect((await loadGifts(meg)).extras).toEqual([{ kind: 'extra', id: expect.any(String), title: 'Gloves', giverId: sam.id, occasion: null }]);
	});

	it('for an occasion, waits for that occasion to be opened', async () => {
		const { meg, sam, l, bday } = await scene();
		await act('addExtra', sam, l, { title: 'Gloves', occasionId: bday.id });
		await markReceived(meg, sam);
		expect((await loadGifts(meg)).extras).toEqual([]);
		await act('openOccasion', meg, l, { occasionId: bday.id });
		expect((await loadGifts(meg)).extras.map((e: any) => [e.title, e.occasion])).toEqual([['Gloves', 'Birthday']]);
	});
});

// Existing claims made before a list had occasions keep the old "received from" rule.
it('claims from before occasions were added are revealed by "received from"', async () => {
	const meg = await createUser();
	const sam = await createUser();
	const l = await createList(meg);
	await share(l, sam);
	const it1 = await createItem(meg, { title: 'Old claim' }, { lists: [l] });
	await claim(it1, sam, 'bought');
	await act('addOccasion', meg, l, { name: 'Birthday', date: '2099-12-12' });
	await markReceived(meg, sam);
	expect((await loadGifts(meg)).fromLists.map((g: any) => g.title)).toEqual(['Old claim']);
});
