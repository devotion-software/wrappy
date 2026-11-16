import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemLink, itemList } from '#lib/server/db/schema';
import { load, actions } from '../../src/routes/(app)/items/+page.server';
import { addImageRow, createItem, createList, createUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

describe('/items load', () => {
	it('lists only my items, A–Z, with covers and the lists they are on', async () => {
		const me = await createUser();
		const other = await createUser();
		const l1 = await createList(me, { title: 'Birthday' });
		const l2 = await createList(me, { title: 'Christmas' });
		const b = await createItem(me, { title: 'Banana' }, { lists: [l1, l2] });
		const a = await createItem(me, { title: 'Apple', price: '3.50', currency: 'EUR', mostWanted: true });
		await createItem(other, { title: 'Aardvark' });
		const second = await addImageRow(b, 2);
		const first = await addImageRow(b, 1);

		const data = await ok<any>(() => load(fakeEvent({ user: me })));
		expect(data.items.map((i: any) => i.title)).toEqual(['Apple', 'Banana']);
		expect(data.items[0]).toEqual({
			id: a.id,
			title: 'Apple',
			price: '3.50',
			currency: 'EUR',
			mostWanted: true,
			cover: null,
			lists: []
		});
		expect(data.items[1].cover).toBe(`/img/items/${b.id}/${first}-thumb.webp`);
		expect(data.items[1].cover).not.toContain(second);
		expect(data.items[1].lists.map((l: any) => l.title).sort()).toEqual(['Birthday', 'Christmas']);
	});

	it('returns an empty list for someone with no wishes', async () => {
		const me = await createUser();
		expect(await ok(() => load(fakeEvent({ user: me })))).toEqual({ items: [] });
	});
});

describe('/items importList', () => {
	it('rejects an empty paste', async () => {
		const me = await createUser();
		const o = await outcome(() => actions.importList(fakeEvent({ user: me, form: { list: '  \n ' } })));
		expect(o).toEqual({ kind: 'fail', status: 400, data: { importError: 'Paste a list with one item per line.' } });
	});

	it('rejects a paste that is too long', async () => {
		const me = await createUser();
		const o = await outcome(() => actions.importList(fakeEvent({ user: me, form: { list: 'x'.repeat(50_001) } })));
		expect(o).toMatchObject({ kind: 'fail', status: 400 });
	});

	it('rejects more than 100 wishes', async () => {
		const me = await createUser();
		const text = Array.from({ length: 101 }, (_, i) => `Wish number ${i}`).join('\n');
		const o = await outcome(() => actions.importList(fakeEvent({ user: me, form: { list: text } })));
		expect(o).toEqual({ kind: 'fail', status: 400, data: { importError: 'You can add up to 100 items at a time.' } });
	});

	it('adds every wish to my library, not to any list, with links and prices', async () => {
		const me = await createUser();
		const data = await ok<any>(() =>
			actions.importList(fakeEvent({ user: me, form: { list: '- Socks £5\n- Book https://shop.example.com/book\n- Mug' } }))
		);
		expect(data).toEqual({ pasted: { added: 3, skipped: [] } });
		const rows = await db.select().from(item).where(eq(item.ownerId, me.id));
		expect(rows.map((r) => r.title).sort()).toEqual(['Book', 'Mug', 'Socks']);
		expect(rows.find((r) => r.title === 'Socks')).toMatchObject({ price: '5.00', currency: 'GBP' });
		const book = rows.find((r) => r.title === 'Book')!;
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, book.id));
		expect(links.map((l) => l.url)).toEqual(['https://shop.example.com/book']);
		for (const r of rows) expect(await db.select().from(itemList).where(eq(itemList.itemId, r.id))).toEqual([]);
	});
});
