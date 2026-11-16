import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemLink, itemList } from '#lib/server/db/schema';
import { addSantaMember, createList, createSanta, createUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

vi.mock('#lib/server/linkFetch', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/linkFetch')>()),
	fetchLinkMeta: vi.fn()
}));
vi.mock('#lib/server/rateLimit', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/rateLimit')>()),
	takeFetchBudget: vi.fn(async () => true)
}));
vi.mock('#lib/server/items', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/items')>()),
	importImages: vi.fn(async (_id: string, urls: string[]) => urls.length)
}));

import { actions, load } from '../../src/routes/(app)/add/+page.server';
import { fetchLinkMeta } from '#lib/server/linkFetch';
import { takeFetchBudget } from '#lib/server/rateLimit';
import { importImages } from '#lib/server/items';

const mockMeta = vi.mocked(fetchLinkMeta);
const mockBudget = vi.mocked(takeFetchBudget);
const mockImport = vi.mocked(importImages);

beforeEach(() => {
	vi.clearAllMocks();
	mockBudget.mockResolvedValue(true);
	mockMeta.mockResolvedValue(null);
});

type U = Awaited<ReturnType<typeof createUser>>;
const add = (user: U, form: Record<string, string>) => outcome(() => (actions.default as any)(fakeEvent({ user, form, path: '/add' })));
const itemsOf = (userId: string) => db.select().from(item).where(eq(item.ownerId, userId));

describe('/add load', () => {
	it('reads what was shared and offers my everyday lists only', async () => {
		const me = await createUser();
		const l = await createList(me, { title: 'Birthday' });
		await createList(me, { archivedAt: new Date() });
		await addSantaMember(await createSanta(me), me);
		const data = await ok<any>(() =>
			(load as any)(fakeEvent({ user: me, path: `/add?title=Scarf&text=${encodeURIComponent('Look https://shop.example.com/s')}` }))
		);
		expect(data.shared).toEqual({ url: 'https://shop.example.com/s', title: 'Scarf' });
		expect(data.lists).toEqual([{ id: l.id, title: 'Birthday' }]);
	});

	it('has nothing shared without params', async () => {
		const me = await createUser();
		const data = await ok<any>(() => (load as any)(fakeEvent({ user: me, path: '/add' })));
		expect(data.shared).toBeNull();
	});
});

describe('/add action', () => {
	it('reads the shop page, keeps its first picture and opens the item', async () => {
		const me = await createUser();
		const l = await createList(me);
		mockMeta.mockResolvedValue({
			title: 'Wool scarf',
			description: 'Grey',
			price: '24.99',
			currency: 'EUR',
			images: ['https://shop.example.com/a.jpg', 'https://shop.example.com/b.jpg']
		});
		const res = await add(me, { url: 'https://shop.example.com/scarf', title: 'Page title', listId: l.id });
		const [it] = await itemsOf(me.id);
		expect(res).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}?list=${l.id}` });
		expect(it).toMatchObject({ title: 'Wool scarf', notes: 'Grey', price: '24.99', currency: 'EUR' });
		expect((await db.select().from(itemList).where(eq(itemList.itemId, it.id))).map((r) => r.listId)).toEqual([l.id]);
		const [link] = await db.select().from(itemLink).where(eq(itemLink.itemId, it.id));
		expect(link.url).toBe('https://shop.example.com/scarf');
		expect(mockImport).toHaveBeenCalledWith(it.id, ['https://shop.example.com/a.jpg'], link.id);
	});

	it("falls back to the shared title (or the shop's name) when the page can't be read", async () => {
		const me = await createUser();
		await add(me, { url: 'https://www.shop.example.com/x', title: 'Nice lamp' });
		await add(me, { url: 'https://www.shop.example.com/y', title: '' });
		expect((await itemsOf(me.id)).map((i) => i.title).sort()).toEqual(['Nice lamp', 'shop.example.com']);
		expect(mockImport).not.toHaveBeenCalled();
	});

	it('adds shared text with no link as an item, in my currency, without fetching', async () => {
		const me = { ...(await createUser()), currency: 'USD' };
		const res = await add(me, { url: '', title: 'Cosy socks' });
		const [it] = await itemsOf(me.id);
		expect(res).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}` });
		expect(it).toMatchObject({ title: 'Cosy socks', currency: 'USD' });
		expect(mockMeta).not.toHaveBeenCalled();
	});

	it('refuses nothing, other people’s lists, and too many fetches', async () => {
		const me = await createUser();
		expect(await add(me, { url: '', title: '' })).toMatchObject({ kind: 'fail', status: 400 });
		const theirs = await createList(await createUser());
		expect(await add(me, { url: 'https://shop.example.com/a', listId: theirs.id })).toMatchObject({ kind: 'error', status: 404 });
		mockBudget.mockResolvedValue(false);
		expect(await add(me, { url: 'https://shop.example.com/a' })).toMatchObject({ kind: 'fail', status: 429 });
		expect(await itemsOf(me.id)).toEqual([]);
	});
});
