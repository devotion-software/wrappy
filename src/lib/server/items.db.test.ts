import { describe, expect, it } from 'vitest';
import { asc, eq } from 'drizzle-orm';
import { db } from './db';
import { item, itemImage, itemLink, itemList } from './db/schema';
import {
	addLink,
	createItem,
	deleteItem,
	importPastedList,
	itemDetail,
	listsContaining,
	requireOwnItem,
	requireOwnList,
	santaPriceProblem,
	setItemLists
} from './items';
import {
	addImageRow,
	addLink as addLinkRow,
	addSantaMember,
	addToList,
	createItem as makeItem,
	createList,
	createSanta,
	createUser
} from '../../../tests/helpers/fixtures';
import { outcome } from '../../../tests/helpers/event';

const listIdsOf = async (itemId: string) =>
	(await db.select({ id: itemList.listId }).from(itemList).where(eq(itemList.itemId, itemId))).map((r) => r.id).sort();

const itemsOf = (ownerId: string) => db.select().from(item).where(eq(item.ownerId, ownerId)).orderBy(asc(item.title));

describe('requireOwnItem / requireOwnList', () => {
	it("returns the owner's own rows", async () => {
		const me = await createUser();
		const it = await makeItem(me);
		const l = await createList(me);
		expect((await requireOwnItem(me.id, it.id)).id).toBe(it.id);
		expect((await requireOwnList(me.id, l.id)).id).toBe(l.id);
	});

	it("404s for someone else's rows or missing ids", async () => {
		const [me, other] = [await createUser(), await createUser()];
		const it = await makeItem(other);
		const l = await createList(other);
		expect(await outcome(() => requireOwnItem(me.id, it.id))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => requireOwnList(me.id, l.id))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => requireOwnItem(me.id, 'missing'))).toMatchObject({ kind: 'error', status: 404 });
	});
});

describe('santaPriceProblem', () => {
	async function santaList(priceLimit: string | null, currency = 'GBP') {
		const me = await createUser();
		const s = await createSanta(me, { priceLimit, currency });
		return addSantaMember(s, me);
	}

	it('allows anything on a normal list', async () => {
		const me = await createUser();
		const l = await createList(me);
		expect(await santaPriceProblem(l.id, { price: '9999.00', currency: 'USD' })).toBeNull();
	});

	it('allows anything when the exchange has no limit', async () => {
		const l = await santaList(null);
		expect(await santaPriceProblem(l.id, { price: '500.00', currency: 'USD' })).toBeNull();
	});

	it('allows unpriced wishes and wishes at or under the limit', async () => {
		const l = await santaList('20.00');
		expect(await santaPriceProblem(l.id, { price: null, currency: 'USD' })).toBeNull();
		expect(await santaPriceProblem(l.id, { price: '20.00', currency: 'GBP' })).toBeNull();
		expect(await santaPriceProblem(l.id, { price: '5.50', currency: 'GBP' })).toBeNull();
	});

	it('rejects wishes over the limit or priced in another currency', async () => {
		const l = await santaList('20.00');
		expect(await santaPriceProblem(l.id, { price: '20.01', currency: 'GBP' })).toBe("That's over the £20 limit for this Secret Santa.");
		expect(await santaPriceProblem(l.id, { price: '10.00', currency: 'EUR' })).toBe(
			'This Secret Santa uses GBP. Set the price in GBP.'
		);
	});
});

describe('createItem', () => {
	it('creates the item with a link and puts it on lists', async () => {
		const me = await createUser();
		const [l1, l2] = [await createList(me), await createList(me)];
		const input = { title: 'Kite', notes: 'red', price: '12.00', currency: 'EUR', mostWanted: true };
		const { itemId, linkId } = await createItem(me.id, input, { listIds: [l1.id, l2.id], linkUrl: 'https://shop.example.com/kite' });
		const [row] = await db.select().from(item).where(eq(item.id, itemId));
		expect(row).toMatchObject({ ownerId: me.id, ...input });
		expect(await listIdsOf(itemId)).toEqual([l1.id, l2.id].sort());
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, itemId));
		expect(links).toEqual([expect.objectContaining({ id: linkId, url: 'https://shop.example.com/kite', sortOrder: 1 })]);
	});

	it('works without a link or lists', async () => {
		const me = await createUser();
		const { itemId, linkId } = await createItem(me.id, { title: 'Socks', notes: null, price: null, currency: 'GBP', mostWanted: false });
		expect(linkId).toBeNull();
		expect(await listIdsOf(itemId)).toEqual([]);
	});
});

describe('importPastedList', () => {
	it('rejects text that is too long, empty, or has too many wishes', async () => {
		const me = await createUser();
		expect(await importPastedList(me.id, 'x'.repeat(50_001), null)).toEqual({
			error: "That's too much to paste in one go. Try a shorter list."
		});
		expect(await importPastedList(me.id, '  \n\n# Heading\n---', null)).toEqual({ error: 'Paste a list with one item per line.' });
		const many = Array.from({ length: 101 }, (_, i) => `Wish number ${i}`).join('\n');
		expect(await importPastedList(me.id, many, null)).toEqual({ error: 'You can add up to 100 items at a time.' });
		expect(await itemsOf(me.id)).toEqual([]);
	});

	it("uses the owner's currency for lines without one", async () => {
		const me = await createUser();
		await importPastedList(me.id, '- Mug\n- Book 20 EUR', null, 'USD');
		const rows = await itemsOf(me.id);
		expect(rows.map((r) => [r.title, r.currency])).toEqual([
			['Book', 'EUR'],
			['Mug', 'USD']
		]);
	});

	it('adds each wish with its link and price, onto the list', async () => {
		const me = await createUser();
		const l = await createList(me);
		const res = await importPastedList(me.id, '- Scarf £12.50 https://shop.example.com/scarf\n- Book 20 EUR\n- Mug', l.id);
		expect(res).toEqual({ added: 3, skipped: [] });
		const rows = await itemsOf(me.id);
		expect(rows.map((r) => [r.title, r.price, r.currency])).toEqual([
			['Book', '20.00', 'EUR'],
			['Mug', null, 'GBP'],
			['Scarf', '12.50', 'GBP']
		]);
		for (const r of rows) expect(await listIdsOf(r.id)).toEqual([l.id]);
		const scarf = rows.find((r) => r.title === 'Scarf')!;
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, scarf.id));
		expect(links.map((x) => x.url)).toEqual(['https://shop.example.com/scarf']);
	});

	it('drops links that are not allowed but keeps the wish', async () => {
		const me = await createUser();
		const res = await importPastedList(me.id, 'Router http://192.168.1.1/admin', null);
		expect(res).toEqual({ added: 1, skipped: [] });
		const [row] = await itemsOf(me.id);
		expect(row.title).toBe('Router');
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, row.id))).toEqual([]);
		expect(await listIdsOf(row.id)).toEqual([]);
	});

	it('skips and reports wishes over a Secret Santa limit', async () => {
		const me = await createUser();
		const s = await createSanta(me, { priceLimit: '20.00', currency: 'GBP' });
		const l = await addSantaMember(s, me);
		const res = await importPastedList(me.id, 'Socks £5\nWatch £200\nHat 10 EUR\nCard', l.id);
		expect(res).toEqual({
			added: 2,
			skipped: ["Watch: That's over the £20 limit for this Secret Santa.", 'Hat: This Secret Santa uses GBP. Set the price in GBP.']
		});
		expect((await itemsOf(me.id)).map((r) => r.title)).toEqual(['Card', 'Socks']);
	});
});

describe('addLink', () => {
	it('appends links in order and trims overlong URLs', async () => {
		const me = await createUser();
		const it = await makeItem(me);
		await addLink(it.id, 'https://a.example.com');
		await addLink(it.id, `https://b.example.com/${'x'.repeat(3000)}`);
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, it.id)).orderBy(asc(itemLink.sortOrder));
		expect(links.map((l) => l.sortOrder)).toEqual([1, 2]);
		expect(links[1].url).toHaveLength(2048);
	});
});

describe('setItemLists', () => {
	it('adds and removes lists, ignoring lists the user does not own', async () => {
		const [me, other] = [await createUser(), await createUser()];
		const [a, b, c] = [await createList(me), await createList(me), await createList(me)];
		const theirs = await createList(other);
		const it = await makeItem(me, {}, { lists: [a, b] });
		await setItemLists(me.id, it.id, [b.id, c.id, theirs.id]);
		expect(await listIdsOf(it.id)).toEqual([b.id, c.id].sort());
		await setItemLists(me.id, it.id, []);
		expect(await listIdsOf(it.id)).toEqual([]);
	});
});

describe('deleteItem', () => {
	it('deletes the item and everything attached to it', async () => {
		const me = await createUser();
		const l = await createList(me);
		const it = await makeItem(me, {}, { lists: [l] });
		await addImageRow(it);
		await addLinkRow(it, 'https://x.example.com');
		await deleteItem(me.id, it.id);
		expect(await db.select().from(item).where(eq(item.id, it.id))).toEqual([]);
		expect(await db.select().from(itemImage).where(eq(itemImage.itemId, it.id))).toEqual([]);
		expect(await listIdsOf(it.id)).toEqual([]);
	});

	it("refuses to delete someone else's item", async () => {
		const [me, other] = [await createUser(), await createUser()];
		const it = await makeItem(other);
		expect(await outcome(() => deleteItem(me.id, it.id))).toMatchObject({ kind: 'error', status: 404 });
		expect(await db.select().from(item).where(eq(item.id, it.id))).toHaveLength(1);
	});
});

describe('listsContaining', () => {
	it('returns the lists an item is on, by title', async () => {
		const me = await createUser();
		const b = await createList(me, { title: 'Birthday' });
		const a = await createList(me, { title: 'Anniversary' });
		await createList(me, { title: 'Christmas' });
		const it = await makeItem(me, {}, { lists: [b, a] });
		expect(await listsContaining(it.id)).toEqual([
			{ id: a.id, title: 'Anniversary' },
			{ id: b.id, title: 'Birthday' }
		]);
	});
});

describe('itemDetail', () => {
	it('returns links and images in sort order', async () => {
		const me = await createUser();
		const it = await makeItem(me);
		const l2 = await addLinkRow(it, 'https://two.example.com', 2);
		const l1 = await addLinkRow(it, 'https://one.example.com', 1);
		const i3 = await addImageRow(it, 3);
		const i1 = await addImageRow(it, 1);
		const { links, images } = await itemDetail(it.id);
		expect(links.map((l) => l.id)).toEqual([l1, l2]);
		expect(images.map((i) => i.id)).toEqual([i1, i3]);
	});

	it('is empty for an item with nothing attached', async () => {
		const me = await createUser();
		const it = await makeItem(me);
		expect(await itemDetail(it.id)).toEqual({ links: [], images: [] });
		await addToList(await createList(me), it);
	});
});
