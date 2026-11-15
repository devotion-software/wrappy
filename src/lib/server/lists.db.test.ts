import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { itemList, list } from './db/schema';
import { addItemToList, friendsLists, hostOf, knownPeople, loadListItems, myLists, publicListsOf } from './lists';
import { newToken } from './ids';
import {
	addImageRow,
	addLink,
	addSantaMember,
	addToList,
	claim,
	createItem,
	createList,
	createSanta,
	createUser,
	markReceived,
	setDrawn,
	share,
	suggest,
	view
} from '../../../tests/helpers/fixtures';

describe('hostOf', () => {
	it.each([
		['https://www.shop.example.com/p/1', 'shop.example.com'],
		['http://example.org', 'example.org'],
		['not a url', 'not a url']
	])('%s → %s', (url, host) => expect(hostOf(url)).toBe(host));
});

describe('loadListItems', () => {
	it('returns nothing for an empty list', async () => {
		const owner = await createUser();
		expect(await loadListItems(await createList(owner), owner.id)).toEqual([]);
	});

	it('orders by sort order and summarises images and links', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const a = await createItem(owner, { title: 'A', price: '12.50', currency: 'EUR', mostWanted: true, notes: 'n' });
		const b = await createItem(owner, { title: 'B' });
		await addToList(l, b, 1);
		await addToList(l, a, 2);
		await addImageRow(a, 5);
		const cover = await addImageRow(a, 2);
		await addLink(a, 'https://second.example.com/x', 2);
		await addLink(a, 'https://www.first.example.com/y', 1);

		const items = await loadListItems(l, owner.id);
		expect(items.map((i) => i.title)).toEqual(['B', 'A']);
		const [vb, va] = items;
		expect(vb).toMatchObject({ cover: null, imageCount: 0, link: null, linkCount: 0, claim: null, suggestion: null });
		expect(va).toMatchObject({
			id: a.id,
			notes: 'n',
			price: '12.50',
			currency: 'EUR',
			mostWanted: true,
			cover: `/img/items/${a.id}/${cover}-thumb.webp`,
			imageCount: 2,
			link: { url: 'https://www.first.example.com/y', host: 'first.example.com' },
			linkCount: 2
		});
	});

	async function setup(visibility: 'public' | 'private' = 'public') {
		const [owner, sam, priya] = await Promise.all([createUser({ name: 'Owner' }), createUser({ name: 'Sam' }), createUser({ name: 'Priya' })]);
		const l = await createList(owner, { visibility });
		const it = await createItem(owner, {}, { lists: [l] });
		return { owner, sam, priya, l, it };
	}

	it('hides claims from the owner', async () => {
		const { owner, sam, l, it } = await setup();
		await claim(it, sam, 'bought');
		const [v] = await loadListItems(l, owner.id);
		expect(v.claim).toBeNull();
	});

	it('reveals a bought claim to the owner after received-from, never a buying one', async () => {
		const { owner, sam, priya, l, it } = await setup();
		const it2 = await createItem(owner, {}, { lists: [l] });
		await claim(it, sam, 'bought');
		await claim(it2, priya, 'buying');
		await markReceived(owner, sam);
		await markReceived(owner, priya);
		const items = await loadListItems(l, owner.id);
		expect(items.find((i) => i.id === it.id)!.claim).toEqual({ status: 'bought', mine: false, byName: 'Sam' });
		expect(items.find((i) => i.id === it2.id)!.claim).toBeNull();
	});

	it('shows the claimer their own claim', async () => {
		const { sam, l, it } = await setup();
		await claim(it, sam, 'buying');
		const [v] = await loadListItems(l, sam.id);
		expect(v.claim).toEqual({ status: 'buying', mine: true, byName: null });
	});

	it('names the claimer to other guests of a public list, and to anonymous visitors', async () => {
		const { sam, priya, l, it } = await setup();
		await claim(it, sam, 'bought');
		expect((await loadListItems(l, priya.id))[0].claim).toEqual({ status: 'bought', mine: false, byName: 'Sam' });
		expect((await loadListItems(l, null))[0].claim).toEqual({ status: 'bought', mine: false, byName: 'Sam' });
	});

	it('hides the claimer name when they cannot see this private list', async () => {
		const { owner, sam, priya, it } = await setup();
		const other = await createList(owner);
		await addToList(other, it);
		await share(other, priya);
		await claim(it, sam, 'buying');
		expect((await loadListItems(other, priya.id))[0].claim).toEqual({ status: 'buying', mine: false, byName: null });
		// Once Sam is invited too, the name shows.
		await share(other, sam);
		expect((await loadListItems(other, priya.id))[0].claim).toEqual({ status: 'buying', mine: false, byName: 'Sam' });
	});

	it("anonymises a Santa's claim on the owner's other lists", async () => {
		const [org, a, b, c, friend] = await Promise.all([
			createUser(),
			createUser({ name: 'A' }),
			createUser({ name: 'B' }),
			createUser({ name: 'C' }),
			createUser()
		]);
		const s = await createSanta(org);
		const la = await addSantaMember(s, a);
		await addSantaMember(s, b);
		await addSantaMember(s, c);
		const pub = await createList(a, { visibility: 'public' });
		const it = await createItem(a, {}, { lists: [la, pub] });
		await setDrawn(s, [
			[b, a],
			[a, c],
			[c, b]
		]);
		await claim(it, b, 'buying');
		expect((await loadListItems(pub, friend.id))[0].claim).toEqual({ status: 'buying', mine: false, byName: null });
		// On the Santa list itself, only the Santa looks; nothing to hide from them.
		expect((await loadListItems(la, b.id))[0].claim).toEqual({ status: 'buying', mine: true, byName: null });
	});

	it('shows a buyer suggestion, flagged for the suggested person', async () => {
		const { sam, priya, l, it } = await setup();
		await suggest(it, sam);
		expect((await loadListItems(l, sam.id))[0].suggestion).toEqual({ name: 'Sam', forViewer: true });
		expect((await loadListItems(l, priya.id))[0].suggestion).toEqual({ name: 'Sam', forViewer: false });
		expect((await loadListItems(l, null))[0].suggestion).toEqual({ name: 'Sam', forViewer: false });
	});
});

describe('myLists', () => {
	it('counts items, previews up to three titles and counts who it is shared with', async () => {
		const owner = await createUser();
		const l = await createList(owner, { shareToken: newToken() });
		for (const t of ['One', 'Two', 'Three', 'Four']) await createItem(owner, { title: t }, { lists: [l] });
		const [g1, g2, g3] = await Promise.all([createUser(), createUser(), createUser()]);
		await share(l, g1);
		await share(l, { email: 'pending@example.test' });
		await view(l, g2, true);
		await view(l, g3, false);
		const empty = await createList(owner, { visibility: 'public' });

		const cards = await myLists(owner.id);
		expect(cards).toHaveLength(2);
		const card = cards.find((c) => c.id === l.id)!;
		expect(card).toMatchObject({ count: 4, preview: ['One', 'Two', 'Three'], sharedWith: 3, visibility: 'private', santaId: null });
		expect(cards.find((c) => c.id === empty.id)).toMatchObject({ count: 0, preview: [], sharedWith: 0 });
	});

	it('stops counting link viewers once the link is off', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		await view(l, await createUser(), true);
		expect((await myLists(owner.id))[0].sharedWith).toBe(0);
	});

	it('returns an empty array for someone with no lists', async () => {
		expect(await myLists((await createUser()).id)).toEqual([]);
	});
});

describe('friendsLists', () => {
	it('includes lists I was invited to (by email or account) or opened, with the owner name', async () => {
		const me = await createUser();
		const owner = await createUser({ name: 'Olive' });
		const byEmail = await createList(owner, { title: 'By email' });
		await share(byEmail, { email: me.email.toUpperCase() });
		const byId = await createList(owner, { title: 'By id' });
		await share(byId, { email: 'old@example.test', id: me.id });
		const opened = await createList(owner, { visibility: 'public', title: 'Opened' });
		await view(opened, me);
		const viaLink = await createList(owner, { shareToken: newToken(), title: 'Link' });
		await view(viaLink, me, true);
		await createItem(owner, { title: 'Socks' }, { lists: [opened] });

		const cards = await friendsLists(me.id, me.email);
		expect(cards.map((c) => c.title).sort()).toEqual(['By email', 'By id', 'Link', 'Opened']);
		expect(cards.find((c) => c.id === opened.id)).toMatchObject({ ownerName: 'Olive', count: 1, preview: ['Socks'], sharedWith: 0 });
	});

	it('excludes revoked links, private lists merely viewed, my own lists and Santa lists', async () => {
		const me = await createUser();
		const owner = await createUser();
		const revoked = await createList(owner);
		await view(revoked, me, true);
		const privateViewed = await createList(owner, { shareToken: newToken() });
		await view(privateViewed, me, false);
		const mine = await createList(me);
		await share(mine, me);
		const s = await createSanta(owner);
		const santaList = await addSantaMember(s, owner);
		await share(santaList, me);
		expect(await friendsLists(me.id, me.email)).toEqual([]);
	});

	it('lists a list once even with several reasons to see it', async () => {
		const me = await createUser();
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		await share(l, me);
		await view(l, me);
		expect(await friendsLists(me.id, me.email)).toHaveLength(1);
	});
});

describe('publicListsOf', () => {
	it('returns only public, non-Santa lists', async () => {
		const owner = await createUser();
		const pub = await createList(owner, { visibility: 'public', title: 'Pub' });
		await createList(owner);
		const s = await createSanta(owner);
		const sl = await addSantaMember(s, owner);
		await db.update(list).set({ visibility: 'public' }).where(eq(list.id, sl.id));
		await createItem(owner, { title: 'Kite' }, { lists: [pub] });
		expect(await publicListsOf(owner.id)).toEqual([
			{ id: pub.id, title: 'Pub', eventDate: null, visibility: 'public', santaId: null, count: 1, preview: ['Kite'], sharedWith: 0 }
		]);
	});
});

describe('addItemToList', () => {
	it('appends to the end and is idempotent', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const [a, b] = [await createItem(owner), await createItem(owner)];
		await addItemToList(l.id, a.id);
		await addItemToList(l.id, b.id);
		await addItemToList(l.id, a.id);
		const rows = await db.select().from(itemList).where(eq(itemList.listId, l.id));
		expect(rows).toHaveLength(2);
		const order = (id: string) => rows.find((r) => r.itemId === id)!.sortOrder;
		expect(order(a.id)).toBe(1);
		expect(order(b.id)).toBe(2);
		const [still] = await db.select().from(itemList).where(and(eq(itemList.listId, l.id), eq(itemList.itemId, a.id)));
		expect(still.sortOrder).toBe(1);
	});
});

describe('knownPeople', () => {
	it('includes invitees, viewers and fellow Santa members, sorted by name', async () => {
		const owner = await createUser();
		const [invited, viewer, santaFriend, stranger, nameless] = await Promise.all([
			createUser({ name: 'Cara' }),
			createUser({ name: 'Ben' }),
			createUser({ name: 'Abe' }),
			createUser({ name: 'Zed' }),
			createUser({ name: '' })
		]);
		const l = await createList(owner);
		await share(l, invited);
		await share(l, { email: 'pending@example.test' });
		await view(l, viewer);
		await view(l, nameless);
		const s = await createSanta(stranger);
		await addSantaMember(s, owner);
		await addSantaMember(s, santaFriend);

		expect(await knownPeople(owner.id)).toEqual([
			{ id: santaFriend.id, name: 'Abe' },
			{ id: viewer.id, name: 'Ben' },
			{ id: invited.id, name: 'Cara' }
		]);
	});

	it('does not include people from other owners’ lists or myself', async () => {
		const owner = await createUser();
		const other = await createUser();
		const l = await createList(other);
		await share(l, owner);
		await view(l, await createUser());
		expect(await knownPeople(owner.id)).toEqual([]);
	});
});
