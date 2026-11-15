import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemImage, itemLink, itemList, itemSuggestion } from '#lib/server/db/schema';
import {
	addImageRow,
	addLink,
	addSantaMember,
	createItem,
	createList,
	createSanta,
	createUser,
	share,
	suggest,
	type TestUser
} from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const mocks = vi.hoisted(() => ({
	fetchLinkMeta: vi.fn(),
	takeFetchBudget: vi.fn(),
	importImages: vi.fn()
}));
vi.mock('#lib/server/linkFetch', async (orig) => ({ ...(await orig<object>()), fetchLinkMeta: mocks.fetchLinkMeta }));
vi.mock('#lib/server/rateLimit', async (orig) => ({ ...(await orig<object>()), takeFetchBudget: mocks.takeFetchBudget }));
vi.mock('#lib/server/items', async (orig) => ({ ...(await orig<object>()), importImages: mocks.importImages }));

const { load, actions } = await import('../../src/routes/(app)/items/[id]/+page.server');

beforeEach(() => {
	mocks.fetchLinkMeta.mockReset();
	mocks.takeFetchBudget.mockReset().mockResolvedValue(true);
	mocks.importImages.mockReset().mockResolvedValue(0);
});

const ev = (me: TestUser, id: string, form?: Record<string, string | string[]>, path?: string) =>
	fakeEvent({ user: me, params: { id }, form, path: path ?? `/items/${id}` });

const getItem = async (id: string) => (await db.select().from(item).where(eq(item.id, id)))[0];
const listsOf = async (id: string) => (await db.select().from(itemList).where(eq(itemList.itemId, id))).map((r) => r.listId).sort();

async function santaListFor(me: TestUser, limit = '20.00', currency = 'GBP') {
	const s = await createSanta(await createUser(), { priceLimit: limit, currency });
	return addSantaMember(s, me);
}

describe('/items/[id] load', () => {
	it('404s for an item that is not mine', async () => {
		const me = await createUser();
		const theirs = await createItem(await createUser());
		expect(await outcome(() => load(ev(me, theirs.id)))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => load(ev(me, 'missing')))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('returns the item with its links, images, lists, people and suggestion', async () => {
		const me = await createUser();
		const friend = await createUser({ name: 'Friendly Fran' });
		const normal = await createList(me, { title: 'A list' });
		const santaList = await santaListFor(me, '15.00', 'GBP');
		const it = await createItem(me, { title: 'Hat' }, { lists: [normal] });
		await addLink(it, 'https://shop.example.com/hat');
		await addImageRow(it);
		await share(normal, friend);
		await suggest(it, friend);

		const data = await ok<any>(() => load(ev(me, it.id)));
		expect(data.item).toMatchObject({ id: it.id, title: 'Hat' });
		expect(data.links.map((l: any) => l.url)).toEqual(['https://shop.example.com/hat']);
		expect(data.images).toHaveLength(1);
		expect(data.onLists).toEqual([normal.id]);
		expect(data.allLists).toEqual(
			expect.arrayContaining([
				{ id: normal.id, title: 'A list', santa: null },
				{ id: santaList.id, title: santaList.title, santa: '£15' }
			])
		);
		expect(data.people).toEqual([{ id: friend.id, name: 'Friendly Fran' }]);
		expect(data.suggestion).toEqual({ userId: friend.id, name: 'Friendly Fran' });
		expect(data.back).toBeNull();
	});

	it('labels a Santa list without a budget as "Secret Santa"', async () => {
		const me = await createUser();
		const s = await createSanta(await createUser());
		const l = await addSantaMember(s, me);
		const it = await createItem(me);
		const data = await ok<any>(() => load(ev(me, it.id)));
		expect(data.allLists.find((x: any) => x.id === l.id).santa).toBe('Secret Santa');
	});

	it('only keeps ?list= as the back link when it is my list', async () => {
		const me = await createUser();
		const mine = await createList(me);
		const theirs = await createList(await createUser());
		const it = await createItem(me);
		expect((await ok<any>(() => load(ev(me, it.id, undefined, `/items/${it.id}?list=${mine.id}`)))).back).toBe(mine.id);
		expect((await ok<any>(() => load(ev(me, it.id, undefined, `/items/${it.id}?list=${theirs.id}`)))).back).toBeNull();
	});
});

describe('/items/[id] actions on someone else’s item', () => {
	it.each([
		'save',
		'lists',
		'addLink',
		'removeLink',
		'importImages',
		'usePrice',
		'imageCover',
		'imageOrder',
		'imageDelete',
		'suggest',
		'delete'
	] as const)('%s → 404', async (name) => {
		const me = await createUser();
		const theirs = await createItem(await createUser(), { title: 'Untouched' });
		const o = await outcome(() =>
			(actions as any)[name](ev(me, theirs.id, { title: 'Hacked', url: 'https://example.com', price: '1', order: '[]' }))
		);
		expect(o).toMatchObject({ kind: 'error', status: 404 });
		expect((await getItem(theirs.id)).title).toBe('Untouched');
	});
});

describe('save', () => {
	it('validates and saves', async () => {
		const me = await createUser();
		const it = await createItem(me, { title: 'Old' });
		expect(await outcome(() => actions.save(ev(me, it.id, { title: '' })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { saveError: 'Give the wish a name.' }
		});
		expect(await ok(() => actions.save(ev(me, it.id, { title: 'New', price: '12', currency: 'EUR', notes: 'n' })))).toEqual({
			saved: true
		});
		expect(await getItem(it.id)).toMatchObject({ title: 'New', price: '12.00', currency: 'EUR', notes: 'n', mostWanted: false });
	});

	it('refuses a price that breaks the budget of a Santa list the item is on', async () => {
		const me = await createUser();
		const l = await santaListFor(me, '20.00');
		const it = await createItem(me, { title: 'Gift', price: '10.00' }, { lists: [l] });
		expect(await outcome(() => actions.save(ev(me, it.id, { title: 'Gift', price: '30' })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { saveError: "That's over the £20 limit for this Secret Santa." }
		});
		expect((await getItem(it.id)).price).toBe('10.00');
	});
});

describe('lists', () => {
	it('sets which of my lists the item is on, ignoring other people’s lists', async () => {
		const me = await createUser();
		const [a, b] = [await createList(me), await createList(me)];
		const foreign = await createList(await createUser());
		const it = await createItem(me, {}, { lists: [a] });
		expect(await ok(() => actions.lists(ev(me, it.id, { listId: [b.id, foreign.id] })))).toEqual({ listsSaved: true });
		expect(await listsOf(it.id)).toEqual([b.id]);
		await ok(() => actions.lists(ev(me, it.id, {})));
		expect(await listsOf(it.id)).toEqual([]);
	});

	it('refuses to add an item over a Santa budget', async () => {
		const me = await createUser();
		const l = await santaListFor(me, '20.00');
		const it = await createItem(me, { price: '50.00' });
		expect(await outcome(() => actions.lists(ev(me, it.id, { listId: l.id })))).toMatchObject({
			kind: 'fail',
			status: 400,
			data: { listsError: expect.stringContaining('over the £20 limit') }
		});
		expect(await listsOf(it.id)).toEqual([]);
	});

	it('keeps an item already on a Santa list (only new lists are checked)', async () => {
		const me = await createUser();
		const l = await santaListFor(me, '20.00');
		const other = await createList(me);
		const it = await createItem(me, {}, { lists: [l] });
		// Price raised directly, bypassing save's check.
		await db.update(item).set({ price: '99.00' }).where(eq(item.id, it.id));
		await ok(() => actions.lists(ev(me, it.id, { listId: [l.id, other.id] })));
		expect(await listsOf(it.id)).toEqual([l.id, other.id].sort());
	});
});

describe('addLink', () => {
	it('rejects a bad link', async () => {
		const me = await createUser();
		const it = await createItem(me);
		for (const url of ['https://example.com:8080/x', 'http://127.0.0.1/', 'not a url at all', 'ftp://example.com/file']) {
			expect(await outcome(() => actions.addLink(ev(me, it.id, { url })))).toMatchObject({ kind: 'fail', status: 400 });
		}
		expect(mocks.fetchLinkMeta).not.toHaveBeenCalled();
	});

	it('stops when the fetch budget is spent', async () => {
		const me = await createUser();
		const it = await createItem(me);
		mocks.takeFetchBudget.mockResolvedValue(false);
		expect(await outcome(() => actions.addLink(ev(me, it.id, { url: 'shop.example.com/x' })))).toMatchObject({
			kind: 'fail',
			status: 429
		});
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, it.id))).toEqual([]);
	});

	it('saves the link and reports what was found', async () => {
		const me = await createUser();
		const it = await createItem(me, { currency: 'GBP' });
		mocks.fetchLinkMeta.mockResolvedValue({ title: 'T', description: null, price: '12.50', currency: null, images: ['https://cdn.example.com/a.jpg'] });
		const data = await ok<any>(() => actions.addLink(ev(me, it.id, { url: 'shop.example.com/x' })));
		expect(mocks.fetchLinkMeta).toHaveBeenCalledWith('https://shop.example.com/x');
		expect(mocks.takeFetchBudget).toHaveBeenCalledWith(me.id);
		const [link] = await db.select().from(itemLink).where(eq(itemLink.itemId, it.id));
		expect(data.linkFound).toEqual({
			linkId: link.id,
			images: ['https://cdn.example.com/a.jpg'],
			price: '£12.50',
			rawPrice: '12.50',
			currency: null,
			failed: false
		});
	});

	it('still saves the link when the page can’t be read', async () => {
		const me = await createUser();
		const it = await createItem(me);
		mocks.fetchLinkMeta.mockResolvedValue(null);
		const data = await ok<any>(() => actions.addLink(ev(me, it.id, { url: 'https://shop.example.com/y' })));
		expect(data.linkFound).toMatchObject({ images: [], price: null, rawPrice: null, failed: true });
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, it.id))).toHaveLength(1);
	});
});

describe('removeLink', () => {
	it('removes just the link by default', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const linkId = await addLink(it, 'https://a.example.com');
		await addImageRow(it, 1, linkId);
		expect(await ok(() => actions.removeLink(ev(me, it.id, { linkId })))).toEqual({ linkRemoved: true });
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, it.id))).toEqual([]);
		expect(await db.select().from(itemImage).where(eq(itemImage.itemId, it.id))).toHaveLength(1);
	});

	it('with images, removes only the pictures fetched from that link', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const linkA = await addLink(it, 'https://a.example.com', 1);
		const linkB = await addLink(it, 'https://b.example.com', 2);
		await addImageRow(it, 1, linkA);
		const keepB = await addImageRow(it, 2, linkB);
		const keepUpload = await addImageRow(it, 3);
		await ok(() => actions.removeLink(ev(me, it.id, { linkId: linkA, withImages: 'on' })));
		const imgs = await db.select().from(itemImage).where(eq(itemImage.itemId, it.id));
		expect(imgs.map((i) => i.id).sort()).toEqual([keepB, keepUpload].sort());
		expect((await db.select().from(itemLink).where(eq(itemLink.itemId, it.id))).map((l) => l.id)).toEqual([linkB]);
	});

	it('cannot remove another item’s link', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const other = await createItem(me);
		const linkId = await addLink(other, 'https://a.example.com');
		await ok(() => actions.removeLink(ev(me, it.id, { linkId })));
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, other.id))).toHaveLength(1);
	});
});

describe('importImages', () => {
	it('imports up to 10 non-empty urls against the fetch budget', async () => {
		const me = await createUser();
		const it = await createItem(me);
		mocks.importImages.mockResolvedValue(3);
		const urls = Array.from({ length: 12 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
		const data = await ok(() => actions.importImages(ev(me, it.id, { image: ['', ...urls], linkId: 'L1' })));
		expect(data).toEqual({ imported: 3, wanted: 10 });
		expect(mocks.takeFetchBudget).toHaveBeenCalledWith(me.id, 10);
		expect(mocks.importImages).toHaveBeenCalledWith(it.id, urls.slice(0, 10), 'L1');
	});

	it('stops when the fetch budget is spent', async () => {
		const me = await createUser();
		const it = await createItem(me);
		mocks.takeFetchBudget.mockResolvedValue(false);
		expect(await outcome(() => actions.importImages(ev(me, it.id, { image: 'https://cdn.example.com/a.jpg' })))).toMatchObject({
			kind: 'fail',
			status: 429
		});
		expect(mocks.importImages).not.toHaveBeenCalled();
	});
});

describe('usePrice', () => {
	it.each([
		['12.345', 'GBP'],
		['abc', 'GBP'],
		['-1', 'GBP'],
		['10', 'gbp'],
		['10', 'POUNDS']
	])('rejects price %j / currency %j', async (price, currency) => {
		const me = await createUser();
		const it = await createItem(me);
		expect(await outcome(() => actions.usePrice(ev(me, it.id, { price, currency })))).toEqual({ kind: 'fail', status: 400, data: {} });
		expect((await getItem(it.id)).price).toBeNull();
	});

	it('saves the price, defaulting to the item currency', async () => {
		const me = await createUser();
		const it = await createItem(me, { currency: 'EUR' });
		expect(await ok(() => actions.usePrice(ev(me, it.id, { price: '19.99' })))).toEqual({ saved: true });
		expect(await getItem(it.id)).toMatchObject({ price: '19.99', currency: 'EUR' });
	});

	it('refuses a price over a Santa budget', async () => {
		const me = await createUser();
		const l = await santaListFor(me, '20.00');
		const it = await createItem(me, {}, { lists: [l] });
		expect(await outcome(() => actions.usePrice(ev(me, it.id, { price: '25', currency: 'GBP' })))).toMatchObject({
			kind: 'fail',
			data: { saveError: expect.stringContaining('over the £20 limit') }
		});
	});
});

describe('image ordering', () => {
	const order = async (itemId: string) =>
		(await db.select().from(itemImage).where(eq(itemImage.itemId, itemId)).orderBy(asc(itemImage.sortOrder))).map((i) => i.id);

	it('imageCover moves an image to the front', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const [a, b, c] = [await addImageRow(it, 1), await addImageRow(it, 2), await addImageRow(it, 3)];
		expect(await ok(() => actions.imageCover(ev(me, it.id, { imageId: c })))).toEqual({ imagesChanged: true });
		expect(await order(it.id)).toEqual([c, a, b]);
	});

	it('imageOrder applies a new order and ignores junk', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const [a, b, c] = [await addImageRow(it, 1), await addImageRow(it, 2), await addImageRow(it, 3)];
		await ok(() => actions.imageOrder(ev(me, it.id, { order: JSON.stringify([b, 42, 'nope', a]) })));
		expect(await order(it.id)).toEqual([b, a, c]);
		expect(await outcome(() => actions.imageOrder(ev(me, it.id, { order: '{bad' })))).toEqual({ kind: 'fail', status: 400, data: {} });
	});

	it('imageDelete removes the image', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const [a, b] = [await addImageRow(it, 1), await addImageRow(it, 2)];
		await ok(() => actions.imageDelete(ev(me, it.id, { imageId: a })));
		expect(await order(it.id)).toEqual([b]);
	});

	it('imageDelete cannot remove another item’s image', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const other = await createItem(me);
		const img = await addImageRow(other);
		await ok(() => actions.imageDelete(ev(me, it.id, { imageId: img })));
		expect(await order(other.id)).toEqual([img]);
	});
});

describe('suggest', () => {
	const suggestionOf = async (itemId: string) =>
		(await db.select().from(itemSuggestion).where(eq(itemSuggestion.itemId, itemId)))[0]?.userId ?? null;

	it('sets, replaces and clears the suggested buyer', async () => {
		const me = await createUser();
		const [ann, bob] = [await createUser(), await createUser()];
		const l = await createList(me);
		await share(l, ann);
		await share(l, bob);
		const it = await createItem(me);
		await ok(() => actions.suggest(ev(me, it.id, { userId: ann.id })));
		expect(await suggestionOf(it.id)).toBe(ann.id);
		await ok(() => actions.suggest(ev(me, it.id, { userId: bob.id })));
		expect(await suggestionOf(it.id)).toBe(bob.id);
		expect(await ok(() => actions.suggest(ev(me, it.id, { userId: '' })))).toEqual({ suggested: true });
		expect(await suggestionOf(it.id)).toBeNull();
	});

	it('refuses someone I don’t know', async () => {
		const me = await createUser();
		const stranger = await createUser();
		const it = await createItem(me);
		expect(await outcome(() => actions.suggest(ev(me, it.id, { userId: stranger.id })))).toMatchObject({ kind: 'error', status: 400 });
		expect(await suggestionOf(it.id)).toBeNull();
	});
});

describe('delete', () => {
	it('deletes the item and goes back to the library', async () => {
		const me = await createUser();
		const it = await createItem(me);
		expect(await outcome(() => actions.delete(ev(me, it.id, {})))).toEqual({ kind: 'redirect', status: 303, location: '/items' });
		expect(await getItem(it.id)).toBeUndefined();
	});

	it('goes back to my list when ?list= is mine', async () => {
		const me = await createUser();
		const l = await createList(me);
		const it = await createItem(me, {}, { lists: [l] });
		expect(await outcome(() => actions.delete(ev(me, it.id, {}, `/items/${it.id}?list=${l.id}`)))).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/lists/${l.id}`
		});
		expect(await db.select().from(itemList).where(and(eq(itemList.listId, l.id), eq(itemList.itemId, it.id)))).toEqual([]);
	});

	it('ignores ?list= pointing at someone else’s list', async () => {
		const me = await createUser();
		const theirs = await createList(await createUser());
		const it = await createItem(me);
		expect(await outcome(() => actions.delete(ev(me, it.id, {}, `/items/${it.id}?list=${theirs.id}`)))).toEqual({
			kind: 'redirect',
			status: 303,
			location: '/items'
		});
	});
});
