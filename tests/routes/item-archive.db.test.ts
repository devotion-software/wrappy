import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemClaim, itemList } from '#lib/server/db/schema';
import { archiveItem, restoreItem } from '#lib/server/items';
import { loadListItems, myLists, publicListsOf } from '#lib/server/lists';
import { claim, createItem, createList, createUser, share, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

vi.mock('#lib/server/email', () => ({
	sendListInviteEmail: vi.fn(async () => {}),
	sendOtpEmail: vi.fn(async () => {}),
	sendSantaAssignmentEmail: vi.fn(async () => {})
}));

const itemPage = await import('../../src/routes/(app)/items/[id]/+page.server');
const library = await import('../../src/routes/(app)/items/+page.server');
const listPage = await import('../../src/routes/(app-public)/lists/[id]/+page.server');
const guestItemPage = await import('../../src/routes/(app-public)/lists/[id]/items/[itemId]/+page.server');

const itemAct = (name: string, user: TestUser, id: string, path = `/items/${id}`) =>
	outcome(() => (itemPage.actions as any)[name](fakeEvent({ user, params: { id }, form: {}, path })));
const row = async (id: string) => (await db.select().from(item).where(eq(item.id, id)))[0];

/** Meg's public list of scarf, book and kite; Sam has reserved the book. */
async function scene() {
	const meg = await createUser({ name: 'Meg' });
	const sam = await createUser({ name: 'Sam' });
	const l = await createList(meg, { visibility: 'public', title: 'Birthday' });
	const scarf = await createItem(meg, { title: 'Scarf' }, { lists: [l] });
	const book = await createItem(meg, { title: 'Book' }, { lists: [l] });
	const kite = await createItem(meg, { title: 'Kite' }, { lists: [l] });
	await claim(book, sam);
	return { meg, sam, l, scarf, book, kite };
}

describe('archiving an item', () => {
	it('hides it from the list, counts and previews, and brings it back in place on restore', async () => {
		const { meg, sam, l, book } = await scene();
		await archiveItem(meg.id, book.id);
		expect((await row(book.id)).archivedAt).toBeInstanceOf(Date);
		expect((await loadListItems(l, meg.id)).map((i) => i.title)).toEqual(['Scarf', 'Kite']);
		expect((await loadListItems(l, sam.id)).map((i) => i.title)).toEqual(['Scarf', 'Kite']);
		expect((await myLists(meg.id)).find((c) => c.id === l.id)).toMatchObject({ count: 2, preview: ['Scarf', 'Kite'] });
		expect((await publicListsOf(meg.id)).find((c) => c.id === l.id)?.count).toBe(2);

		// Nothing was thrown away: list membership and Sam's claim are still there.
		expect(await db.select().from(itemList).where(eq(itemList.itemId, book.id))).toHaveLength(1);
		expect(await db.select().from(itemClaim).where(eq(itemClaim.itemId, book.id))).toHaveLength(1);

		await restoreItem(meg.id, book.id);
		expect((await row(book.id)).archivedAt).toBeNull();
		const back = await loadListItems(l, sam.id);
		expect(back.map((i) => i.title)).toEqual(['Scarf', 'Book', 'Kite']);
		expect(back.find((i) => i.id === book.id)?.claims.mine).toBeTruthy();
	});

	it('only the owner can archive or restore', async () => {
		const { sam, book } = await scene();
		expect(await outcome(() => archiveItem(sam.id, book.id))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => restoreItem(sam.id, book.id))).toMatchObject({ kind: 'error', status: 404 });
		expect(await itemAct('archive', sam, book.id)).toMatchObject({ kind: 'error', status: 404 });
		expect((await row(book.id)).archivedAt).toBeNull();
	});

	it('guests get a 404 for an archived item and cannot claim it', async () => {
		const { meg, l, scarf } = await scene();
		const ann = await createUser();
		await share(l, ann);
		await archiveItem(meg.id, scarf.id);
		expect(
			await outcome(() => (guestItemPage.load as any)(fakeEvent({ user: ann, params: { id: l.id, itemId: scarf.id } })))
		).toMatchObject({ kind: 'error', status: 404 });
		expect(
			await outcome(() => (listPage.actions as any).claim(fakeEvent({ user: ann, params: { id: l.id }, form: { itemId: scarf.id } })))
		).toMatchObject({ kind: 'error', status: 404 });
		expect(await db.select().from(itemClaim).where(eq(itemClaim.itemId, scarf.id))).toEqual([]);
	});

	it("can't be added to a list while archived", async () => {
		const { meg, scarf } = await scene();
		const other = await createList(meg);
		await archiveItem(meg.id, scarf.id);
		const data = await ok<any>(() => (listPage.load as any)(fakeEvent({ user: meg, params: { id: other.id } })));
		expect(data.owned.library.map((i: any) => i.id)).not.toContain(scarf.id);
		await outcome(() => (listPage.actions as any).addExisting(fakeEvent({ user: meg, params: { id: other.id }, form: { itemId: scarf.id } })));
		expect(await db.select().from(itemList).where(eq(itemList.listId, other.id))).toEqual([]);
	});
});

describe('item page actions', () => {
	it('archive goes back to the list it came from, or to All my items, offering an undo', async () => {
		const { meg, l, scarf, kite } = await scene();
		expect(await itemAct('archive', meg, scarf.id, `/items/${scarf.id}?list=${l.id}`)).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/lists/${l.id}?archived=${scarf.id}`
		});
		expect(await itemAct('archive', meg, kite.id)).toEqual({ kind: 'redirect', status: 303, location: `/items?archived=${kite.id}` });
		expect(await itemAct('restore', meg, scarf.id)).toEqual({ kind: 'ok', data: { restored: true } });
		expect((await row(scarf.id)).archivedAt).toBeNull();
	});

	it('the owner can still open an archived item to restore it', async () => {
		const { meg, scarf } = await scene();
		await archiveItem(meg.id, scarf.id);
		const data = await ok<any>(() => (itemPage.load as any)(fakeEvent({ user: meg, params: { id: scarf.id } })));
		expect(data.item.archivedAt).toBeInstanceOf(Date);
	});
});

describe('list page undo', () => {
	it("restores the owner's item, and only theirs", async () => {
		const { meg, sam, l, scarf } = await scene();
		await archiveItem(meg.id, scarf.id);
		const undo = (user: TestUser) =>
			outcome(() => (listPage.actions as any).restoreItem(fakeEvent({ user, params: { id: l.id }, form: { itemId: scarf.id } })));
		expect(await undo(sam)).toMatchObject({ kind: 'error', status: 404 });
		expect((await row(scarf.id)).archivedAt).not.toBeNull();
		expect(await undo(meg)).toEqual({ kind: 'ok', data: { restoredItem: scarf.id } });
		expect((await row(scarf.id)).archivedAt).toBeNull();
	});
});

describe('All my items', () => {
	it('flags archived items, says which was just archived, and restores', async () => {
		const { meg, scarf } = await scene();
		await archiveItem(meg.id, scarf.id);
		const data = await ok<any>(() => (library.load as any)(fakeEvent({ user: meg, path: `/items?archived=${scarf.id}` })));
		expect(data.justArchived).toEqual({ id: scarf.id, title: 'Scarf' });
		const byTitle = Object.fromEntries(data.items.map((i: any) => [i.title, i.archived]));
		expect(byTitle).toEqual({ Book: false, Kite: false, Scarf: true });

		expect(await outcome(() => (library.actions as any).restore(fakeEvent({ user: meg, form: { itemId: scarf.id } })))).toEqual({
			kind: 'ok',
			data: { restored: scarf.id }
		});
		expect((await row(scarf.id)).archivedAt).toBeNull();
		// Not after a restore, or for an item that isn't archived.
		const again = await ok<any>(() => (library.load as any)(fakeEvent({ user: meg, path: `/items?archived=${scarf.id}` })));
		expect(again.justArchived).toBeNull();
	});

	it("can't restore someone else's item", async () => {
		const { meg, scarf } = await scene();
		await archiveItem(meg.id, scarf.id);
		const sam = await createUser();
		expect(await outcome(() => (library.actions as any).restore(fakeEvent({ user: sam, form: { itemId: scarf.id } })))).toMatchObject({
			kind: 'error',
			status: 404
		});
		expect((await row(scarf.id)).archivedAt).not.toBeNull();
	});
});
