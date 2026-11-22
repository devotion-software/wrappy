import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemLink, itemList, list, listShare, listViewer } from '#lib/server/db/schema';
import { newToken } from '#lib/server/ids';
import {
	addSantaMember,
	addToList,
	claim,
	createItem,
	createList,
	createSanta,
	createUser,
	markReceived,
	share,
	uniq,
	view
} from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

vi.mock('#lib/server/linkFetch', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/linkFetch')>()),
	fetchLinkMeta: vi.fn()
}));
vi.mock('#lib/server/rateLimit', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/rateLimit')>()),
	takeFetchBudget: vi.fn(async () => true)
}));
vi.mock('#lib/server/email', () => ({
	sendListInviteEmail: vi.fn(async () => {}),
	sendOtpEmail: vi.fn(async () => {}),
	sendSantaAssignmentEmail: vi.fn(async () => {})
}));
vi.mock('#lib/server/items', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/items')>()),
	importImages: vi.fn(async (_id: string, urls: string[]) => urls.length)
}));

import { load, actions } from '../../src/routes/(app-public)/lists/[id]/+page.server';
import { fetchLinkMeta } from '#lib/server/linkFetch';
import { takeFetchBudget } from '#lib/server/rateLimit';
import { sendListInviteEmail } from '#lib/server/email';
import { importImages } from '#lib/server/items';

const mockMeta = vi.mocked(fetchLinkMeta);
const mockBudget = vi.mocked(takeFetchBudget);
const mockInvite = vi.mocked(sendListInviteEmail);
const mockImport = vi.mocked(importImages);

beforeEach(() => {
	vi.clearAllMocks();
	mockBudget.mockResolvedValue(true);
});

type U = Awaited<ReturnType<typeof createUser>>;
type L = Awaited<ReturnType<typeof createList>>;

const act = (name: keyof typeof actions, user: U | null, l: { id: string }, form: Record<string, string | string[]> = {}, path?: string) =>
	outcome(() => (actions[name] as any)(fakeEvent({ user, params: { id: l.id }, form, path: path ?? `/lists/${l.id}` })));

const runLoad = (user: U | null, l: { id: string }, cookies: Record<string, string> = {}) =>
	outcome(() => (load as any)(fakeEvent({ user, params: { id: l.id }, cookies, path: `/lists/${l.id}` })));

async function itemsOn(l: { id: string }) {
	return db
		.select({ id: item.id, title: item.title, price: item.price, currency: item.currency, sortOrder: itemList.sortOrder })
		.from(itemList)
		.innerJoin(item, eq(item.id, itemList.itemId))
		.where(eq(itemList.listId, l.id))
		.orderBy(itemList.sortOrder);
}

async function getList(id: string) {
	const [l] = await db.select().from(list).where(eq(list.id, id));
	return l ?? null;
}

async function santaSetup(priceLimit: string | null = '20.00') {
	const org = await createUser();
	const s = await createSanta(org, { priceLimit, currency: 'GBP' });
	const member = await createUser();
	const l = await addSantaMember(s, member);
	return { org, s, member, l };
}

describe('load', () => {
	it('404s with a generic message when a signed-in viewer has no access', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const stranger = await createUser();
		expect(await runLoad(stranger, l)).toEqual({
			kind: 'error',
			status: 404,
			message: "This list doesn't exist, or it hasn't been shared with you."
		});
		expect(await runLoad(null, { id: 'missing' })).toEqual({
			kind: 'error',
			status: 404,
			message: "This list doesn't exist, or it hasn't been shared with you."
		});
	});

	it('sends a signed-out visitor to sign in, then back to the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await runLoad(null, l)).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/signin?next=${encodeURIComponent(`/lists/${l.id}`)}`
		});
	});

	it('lets an invitee with no account sign up from the email and see the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const email = `new${uniq()}@example.com`;
		expect(await act('share', owner, l, { email })).toMatchObject({ kind: 'ok' });
		const link = new URL(mockInvite.mock.calls[0][0].url);
		expect(link.pathname).toBe(`/lists/${l.id}`);
		// Signed out: bounced to sign in, coming back to the list.
		expect(await runLoad(null, l)).toMatchObject({ kind: 'redirect', location: `/signin?next=${encodeURIComponent(link.pathname)}` });
		// After signing up with that email, the list opens.
		const invitee = await createUser({ email });
		expect(await runLoad(invitee, l)).toMatchObject({ kind: 'ok' });
	});

	it('gives guests the list and items but no owner data', async () => {
		const owner = await createUser({ username: `own${uniq()}` });
		const l = await createList(owner, { visibility: 'public', description: 'Hi', eventDate: '2026-12-25' });
		const it = await createItem(owner, { title: 'Socks' }, { lists: [l] });
		const data = await ok<any>(() => (load as any)(fakeEvent({ user: null, params: { id: l.id } })));
		expect(data.isOwner).toBe(false);
		expect(data.owned).toBeNull();
		expect(data.list).toEqual({
			id: l.id,
			title: l.title,
			description: 'Hi',
			eventDate: '2026-12-25',
			visibility: 'public',
			santaId: null,
			archived: false,
			isPast: false
		});
		expect(data.owner).toEqual({ id: owner.id, name: owner.name, username: owner.username });
		expect(data.items.map((i: any) => i.id)).toEqual([it.id]);
		expect(data.santa).toBeNull();
		expect(JSON.stringify(data)).not.toContain('shareToken');
	});

	it('shows guests claims, but hides unrevealed claims from the owner', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const buyer = await createUser();
		const a = await createItem(owner, { title: 'A' }, { lists: [l] });
		const b = await createItem(owner, { title: 'B' }, { lists: [l] });
		await claim(a, buyer, 'bought');
		await claim(b, buyer, 'buying');

		const guest = await createUser();
		const asGuest = await ok<any>(() => (load as any)(fakeEvent({ user: guest, params: { id: l.id } })));
		expect(asGuest.items.find((i: any) => i.id === a.id).claims).toMatchObject({ others: [{ status: 'bought', byName: buyer.name }], full: true });

		const asOwner = await ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id } })));
		expect(asOwner.items.every((i: any) => i.claims.mine === null && i.claims.others.length === 0 && !i.claims.full)).toBe(true);
		expect(JSON.stringify(asOwner)).not.toContain(buyer.name);

		await markReceived(owner, buyer);
		const revealed = await ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id } })));
		expect(revealed.items.find((i: any) => i.id === a.id).claims.others).toEqual([{ status: 'bought', byName: buyer.name }]);
		expect(revealed.items.find((i: any) => i.id === b.id).claims.others).toEqual([]);
	});

	it('gives the owner shares, viewers, library and username status', async () => {
		const owner = await createUser({ username: null });
		const l = await createList(owner, { shareToken: newToken() });
		const onList = await createItem(owner, { title: 'On list' }, { lists: [l] });
		const off = await createItem(owner, { title: 'Off list' });
		const otherPersons = await createItem(await createUser(), { title: 'Not mine' });
		const invited = await createUser();
		await share(l, invited);
		await share(l, { email: `pending-${uniq()}@example.test` });
		const viewer = await createUser();
		await view(l, viewer);

		const data = await ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id } })));
		expect(data.isOwner).toBe(true);
		expect(data.owned.shareToken).toBe(l.shareToken);
		expect(data.owned.hasUsername).toBe(false);
		expect(data.owned.shares).toHaveLength(2);
		expect(data.owned.shares.find((s: any) => s.email === invited.email).name).toBe(invited.name);
		expect(data.owned.shares.find((s: any) => s.email !== invited.email).name).toBeNull();
		expect(data.owned.viewers).toEqual([{ id: viewer.id, name: viewer.name }]);
		const libIds = data.owned.library.map((i: any) => i.id);
		expect(libIds).toContain(off.id);
		expect(libIds).not.toContain(onList.id);
		expect(libIds).not.toContain(otherPersons.id);
	});

	it('includes every owned item in the library when the list is empty', async () => {
		const owner = await createUser({ username: `u${uniq()}` });
		const l = await createList(owner);
		const a = await createItem(owner);
		const data = await ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id } })));
		expect(data.owned.library.map((i: any) => i.id)).toEqual([a.id]);
		expect(data.owned.hasUsername).toBe(true);
	});

	it('includes Secret Santa details on a Santa list', async () => {
		const { s, member, l } = await santaSetup('25.00');
		const data = await ok<any>(() => (load as any)(fakeEvent({ user: member, params: { id: l.id } })));
		expect(data.santa).toEqual({ id: s.id, name: s.name, limit: '£25' });
	});
});

describe('owner-only actions', () => {
	const ownerActions = [
		'addWish',
		'addManual',
		'importList',
		'importImages',
		'addExisting',
		'remove',
		'reorder',
		'settings',
		'deleteList',
		'archive',
		'unarchive',
		'share',
		'unshare',
		'newLink',
		'disableLink'
	] as const;

	it.each(ownerActions)('%s: 401 signed out, 404 for others (even with access)', async (name) => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public', title: 'Keep' });
		const guest = await createUser();
		expect(await act(name, null, l, { wish: 'x', title: 'x' })).toMatchObject({ kind: 'error', status: 401 });
		expect(await act(name, guest, l, { wish: 'x', title: 'x', email: 'a@b.co' })).toMatchObject({ kind: 'error', status: 404 });
		expect((await getList(l.id))?.title).toBe('Keep');
	});
});

describe('addWish', () => {
	it('rejects an empty wish', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('addWish', owner, l, { wish: '   ' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { addError: 'Write an item or paste a shop link.' }
		});
	});

	it('adds a plain-text wish to the end of the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		await createItem(owner, { title: 'First' }, { lists: [l] });
		expect(await act('addWish', owner, l, { wish: '  Warm socks  ' })).toEqual({ kind: 'ok', data: { added: true } });
		const rows = await itemsOn(l);
		expect(rows.map((r) => r.title)).toEqual(['First', 'Warm socks']);
		expect(mockMeta).not.toHaveBeenCalled();
	});

	it("gives a plain-text item the owner's currency", async () => {
		const owner = { ...(await createUser()), currency: 'EUR' };
		const l = await createList(owner);
		await act('addWish', owner, l, { wish: 'Gloves' });
		expect((await itemsOn(l)).map((r) => r.currency)).toEqual(['EUR']);
	});

	it('rejects plain text over 200 characters', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('addWish', owner, l, { wish: 'a '.repeat(150) })).toMatchObject({
			kind: 'fail',
			status: 400,
			data: { addError: 'Keep the item under 200 characters.' }
		});
		expect(await itemsOn(l)).toEqual([]);
	});

	it('rejects a link that fails validation', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('addWish', owner, l, { wish: 'http://127.0.0.1/x' })).toMatchObject({
			kind: 'fail',
			status: 400,
			data: { addError: expect.stringContaining("doesn't look right") }
		});
		expect(mockBudget).not.toHaveBeenCalled();
	});

	it('creates a wish from a shop link with its details', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		mockMeta.mockResolvedValue({
			title: 'Wool scarf',
			description: 'Grey',
			price: '24.99',
			currency: 'GBP',
			images: ['https://shop.example.com/a.jpg']
		});
		const res = await act('addWish', owner, l, { wish: 'shop.example.com/scarf' });
		expect(mockBudget).toHaveBeenCalledWith(owner.id);
		expect(mockMeta).toHaveBeenCalledWith('https://shop.example.com/scarf');
		expect(res).toMatchObject({
			kind: 'ok',
			data: { found: { title: 'Wool scarf', price: '£24.99', images: ['https://shop.example.com/a.jpg'] } }
		});
		const found = (res as any).data.found;
		const [row] = await db.select().from(item).where(eq(item.id, found.itemId));
		expect(row).toMatchObject({ ownerId: owner.id, title: 'Wool scarf', notes: 'Grey', price: '24.99' });
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, found.itemId));
		expect(links.map((x) => [x.id, x.url])).toEqual([[found.linkId, 'https://shop.example.com/scarf']]);
		expect((await itemsOn(l)).map((r) => r.id)).toEqual([found.itemId]);
	});

	it('falls back to the host name when the page has no title', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		mockMeta.mockResolvedValue({ title: null, description: null, price: null, currency: null, images: ['https://x.example/i.png'] });
		const res = await act('addWish', owner, l, { wish: 'https://www.example.com/p/1' });
		expect(res).toMatchObject({ kind: 'ok', data: { found: { title: 'example.com', price: null } } });
	});

	it('asks for manual details (422) when the page cannot be read', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		mockMeta.mockResolvedValue(null);
		expect(await act('addWish', owner, l, { wish: 'https://shop.example.com/x' })).toEqual({
			kind: 'fail',
			status: 422,
			data: { manualUrl: 'https://shop.example.com/x' }
		});
		expect(await itemsOn(l)).toEqual([]);
	});

	it('returns 429 when the fetch budget is spent', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		mockBudget.mockResolvedValue(false);
		expect(await act('addWish', owner, l, { wish: 'https://shop.example.com/x' })).toMatchObject({ kind: 'fail', status: 429 });
		expect(mockMeta).not.toHaveBeenCalled();
	});

	it('refuses a linked wish over a Secret Santa limit', async () => {
		const { member, l } = await santaSetup('20.00');
		mockMeta.mockResolvedValue({ title: 'Pricey', description: null, price: '50.00', currency: 'GBP', images: [] });
		expect(await act('addWish', member, l, { wish: 'https://shop.example.com/x' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { addError: "That's over the £20 limit for this Secret Santa." }
		});
		expect(await itemsOn(l)).toEqual([]);
	});
});

describe('addManual', () => {
	it('creates the wish with its link', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(
			await act('addManual', owner, l, { title: 'Lamp', price: '£30', currency: 'gbp', url: 'shop.example.com/lamp', mostWanted: 'on' })
		).toEqual({ kind: 'ok', data: { added: true } });
		const [row] = await itemsOn(l);
		expect(row).toMatchObject({ title: 'Lamp', price: '30.00', currency: 'GBP' });
		const links = await db.select().from(itemLink).where(eq(itemLink.itemId, row.id));
		expect(links.map((x) => x.url)).toEqual(['https://shop.example.com/lamp']);
	});

	it('drops an invalid link but keeps the wish', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		await act('addManual', owner, l, { title: 'Lamp', url: 'http://10.0.0.1/' });
		const [row] = await itemsOn(l);
		expect(await db.select().from(itemLink).where(eq(itemLink.itemId, row.id))).toEqual([]);
	});

	it('returns form errors with the url', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('addManual', owner, l, { title: '', url: 'https://shop.example.com/a' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { manualUrl: 'https://shop.example.com/a', manualError: 'Give the item a name.' }
		});
		expect(await act('addManual', owner, l, { title: 'X', price: 'lots' })).toMatchObject({
			kind: 'fail',
			data: { manualUrl: null, manualError: expect.stringContaining('price') }
		});
	});

	it('enforces the Secret Santa limit and currency', async () => {
		const { member, l } = await santaSetup('20.00');
		expect(await act('addManual', member, l, { title: 'X', price: '21' })).toMatchObject({
			kind: 'fail',
			data: { manualError: "That's over the £20 limit for this Secret Santa." }
		});
		expect(await act('addManual', member, l, { title: 'X', price: '5', currency: 'EUR' })).toMatchObject({
			kind: 'fail',
			data: { manualError: 'This Secret Santa uses GBP. Set the price in GBP.' }
		});
		expect(await act('addManual', member, l, { title: 'Cheap', price: '20' })).toMatchObject({ kind: 'ok' });
	});
});

describe('importList', () => {
	it('adds each pasted wish to the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const res = await act('importList', owner, l, { list: '- Socks\n- Book £12\n- Mug' });
		expect(res).toEqual({ kind: 'ok', data: { pasted: { added: 3, skipped: [] } } });
		expect((await itemsOn(l)).map((r) => r.title)).toEqual(['Socks', 'Book', 'Mug']);
	});

	it('reports an empty paste', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('importList', owner, l, { list: '  \n ' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { importError: 'Paste a list with one item per line.' }
		});
	});

	it('skips wishes over a Santa limit', async () => {
		const { member, l } = await santaSetup('20.00');
		const res = await act('importList', member, l, { list: 'Socks\nWatch £300' });
		expect(res).toMatchObject({ kind: 'ok', data: { pasted: { added: 1, skipped: [expect.stringContaining('Watch')] } } });
	});
});

describe('importImages', () => {
	it('imports up to 10 pictures for one of my items', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l] });
		const urls = Array.from({ length: 12 }, (_, i) => `https://x.example/${i}.jpg`);
		const res = await act('importImages', owner, l, { itemId: it.id, linkId: 'L', image: [...urls, ''] });
		expect(res).toEqual({ kind: 'ok', data: { imported: 10, wanted: 10 } });
		expect(mockBudget).toHaveBeenCalledWith(owner.id, 10);
		expect(mockImport).toHaveBeenCalledWith(it.id, urls.slice(0, 10), 'L');
	});

	it('404s for someone else’s item', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const other = await createItem(await createUser());
		expect(await act('importImages', owner, l, { itemId: other.id, image: 'https://x.example/a.jpg' })).toMatchObject({
			kind: 'error',
			status: 404
		});
		expect(mockImport).not.toHaveBeenCalled();
	});

	it('returns 429 when over budget', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner);
		mockBudget.mockResolvedValue(false);
		expect(await act('importImages', owner, l, { itemId: it.id, image: 'https://x.example/a.jpg' })).toMatchObject({
			kind: 'fail',
			status: 429
		});
	});
});

describe('addExisting', () => {
	it('adds my items and ignores other people’s', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const mine = await createItem(owner);
		const theirs = await createItem(await createUser());
		expect(await act('addExisting', owner, l, { itemId: [mine.id, theirs.id] })).toEqual({ kind: 'ok', data: { added: true } });
		expect((await itemsOn(l)).map((r) => r.id)).toEqual([mine.id]);
	});

	it('is fine with nothing selected', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('addExisting', owner, l)).toEqual({ kind: 'ok', data: { added: true } });
	});

	it('adds what fits a Santa list and reports the rest', async () => {
		const { member, l } = await santaSetup('20.00');
		const cheap = await createItem(member, { title: 'Cheap', price: '10.00' });
		const dear = await createItem(member, { title: 'Dear', price: '99.00' });
		const res = await act('addExisting', member, l, { itemId: [cheap.id, dear.id] });
		expect(res).toMatchObject({ kind: 'fail', status: 400, data: { addError: expect.stringContaining('Dear:') } });
		expect((await itemsOn(l)).map((r) => r.id)).toEqual([cheap.id]);
	});
});

describe('remove and reorder', () => {
	it('removes an item from this list only', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const other = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l, other] });
		expect(await act('remove', owner, l, { itemId: it.id })).toEqual({ kind: 'ok', data: { removed: true } });
		expect(await itemsOn(l)).toEqual([]);
		expect((await itemsOn(other)).map((r) => r.id)).toEqual([it.id]);
		expect(await db.select().from(item).where(eq(item.id, it.id))).toHaveLength(1);
	});

	it('reorders, ignoring non-string ids and items from other lists', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const other = await createList(owner);
		const [a, b, c] = [await createItem(owner), await createItem(owner), await createItem(owner)];
		await addToList(l, a, 1);
		await addToList(l, b, 2);
		await addToList(l, c, 3);
		const elsewhere = await createItem(owner, {}, { lists: [other] });
		const res = await act('reorder', owner, l, { order: JSON.stringify([c.id, 42, a.id, elsewhere.id, b.id]) });
		expect(res).toEqual({ kind: 'ok', data: { reordered: true } });
		expect((await itemsOn(l)).map((r) => [r.id, r.sortOrder])).toEqual([
			[c.id, 1],
			[a.id, 3],
			[b.id, 5]
		]);
		expect((await itemsOn(other))[0].sortOrder).toBe(1);
	});

	it('rejects malformed JSON', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('reorder', owner, l, { order: '[oops' })).toEqual({ kind: 'fail', status: 400, data: {} });
	});
});

describe('settings and deleteList', () => {
	it('saves validated settings', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(
			await act('settings', owner, l, { title: ' Birthday ', description: 'Yay', eventDate: '2026-07-01', visibility: 'public' })
		).toEqual({ kind: 'ok', data: { saved: true } });
		expect(await getList(l.id)).toMatchObject({ title: 'Birthday', description: 'Yay', eventDate: '2026-07-01', visibility: 'public' });
	});

	it('returns validation errors without saving', async () => {
		const owner = await createUser();
		const l = await createList(owner, { title: 'Keep' });
		expect(await act('settings', owner, l, { title: '' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { settingsError: 'Give your list a name.' }
		});
		expect(await act('settings', owner, l, { title: 'X', eventDate: '25/12/2026' })).toMatchObject({
			data: { settingsError: 'Pick a valid date.' }
		});
		expect((await getList(l.id))?.title).toBe('Keep');
	});

	it('keeps Santa lists private', async () => {
		const { member, l } = await santaSetup();
		await act('settings', member, l, { title: 'Renamed', visibility: 'public' });
		expect(await getList(l.id)).toMatchObject({ title: 'Renamed', visibility: 'private' });
	});

	it('deletes a list but keeps its items', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await act('deleteList', owner, l)).toEqual({ kind: 'redirect', status: 303, location: '/lists' });
		expect(await getList(l.id)).toBeNull();
		expect(await db.select().from(item).where(eq(item.id, it.id))).toHaveLength(1);
	});

	it('refuses to delete a Santa list', async () => {
		const { member, l } = await santaSetup();
		expect(await act('deleteList', member, l)).toEqual({
			kind: 'fail',
			status: 400,
			data: { settingsError: 'Leave the Secret Santa to remove this list.' }
		});
		expect(await getList(l.id)).not.toBeNull();
	});
});

describe('share and unshare', () => {
	async function sharesOf(l: L) {
		return db.select().from(listShare).where(eq(listShare.listId, l.id));
	}

	it('validates the email', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		for (const email of ['', 'nope', 'a@b', 'a b@c.de']) {
			expect(await act('share', owner, l, { email })).toEqual({
				kind: 'fail',
				status: 400,
				data: { shareError: 'Enter a full email address.' }
			});
		}
		expect(await act('share', owner, l, { email: owner.email.toUpperCase() })).toEqual({
			kind: 'fail',
			status: 400,
			data: { shareError: "That's your own email." }
		});
		expect(await sharesOf(l)).toEqual([]);
		expect(mockInvite).not.toHaveBeenCalled();
	});

	it('invites a new address, lower-cased, and emails them', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const email = `Friend-${uniq()}@Example.test`;
		expect(await act('share', owner, l, { email: ` ${email} ` })).toEqual({ kind: 'ok', data: { shared: email.toLowerCase() } });
		const rows = await sharesOf(l);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ email: email.toLowerCase(), userId: null });
		expect(mockInvite).toHaveBeenCalledTimes(1);
		expect(mockInvite).toHaveBeenCalledWith({
			email: email.toLowerCase(),
			ownerName: owner.name,
			listTitle: l.title,
			url: `http://localhost:5182/lists/${l.id}`
		});
	});

	it('does not re-send the invite when sharing with the same address again', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const email = `again-${uniq()}@example.test`;
		await act('share', owner, l, { email });
		await act('share', owner, l, { email: email.toUpperCase() });
		expect(await sharesOf(l)).toHaveLength(1);
		expect(mockInvite).toHaveBeenCalledTimes(1);
	});

	it('keeps a single share row when sharing with the same address twice', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const email = `twice-${uniq()}@example.test`;
		await act('share', owner, l, { email });
		expect(await act('share', owner, l, { email: email.toUpperCase() })).toMatchObject({ kind: 'ok' });
		expect(await sharesOf(l)).toHaveLength(1);
	});

	it('links the invite to an existing account', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const friend = await createUser();
		await act('share', owner, l, { email: friend.email });
		expect((await sharesOf(l))[0].userId).toBe(friend.id);
	});

	it('still succeeds when the email fails to send', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		mockInvite.mockRejectedValueOnce(new Error('smtp down'));
		expect(await act('share', owner, l, { email: `x-${uniq()}@example.test` })).toMatchObject({ kind: 'ok' });
	});

	it('refuses to share a Santa list', async () => {
		const { member, l } = await santaSetup();
		expect(await act('share', member, l, { email: 'a@example.test' })).toEqual({
			kind: 'fail',
			status: 400,
			data: { shareError: 'Secret Santa lists are only shown to your Santa.' }
		});
	});

	it('unshares only within this list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const other = await createList(owner);
		const mine = await share(l, { email: 'a@example.test' });
		const theirs = await share(other, { email: 'b@example.test' });
		// Another list's share id is ignored.
		expect(await act('unshare', owner, l, { shareId: theirs })).toEqual({ kind: 'ok', data: { unshared: true } });
		expect(await sharesOf(other)).toHaveLength(1);
		await act('unshare', owner, l, { shareId: mine });
		expect(await sharesOf(l)).toEqual([]);
	});

	it('a stranger cannot unshare via their own list id', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const shareId = await share(l, { email: 'a@example.test' });
		const stranger = await createUser();
		const strangersList = await createList(stranger);
		await act('unshare', stranger, strangersList, { shareId });
		expect(await sharesOf(l)).toHaveLength(1);
	});
});

describe('secret links', () => {
	async function viewerRow(l: L, u: U) {
		const [r] = await db.select().from(listViewer).where(and(eq(listViewer.listId, l.id), eq(listViewer.userId, u.id)));
		return r;
	}

	it('creates a link', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		expect(await act('newLink', owner, l)).toEqual({ kind: 'ok', data: { linkChanged: true } });
		expect((await getList(l.id))?.shareToken).toMatch(/^[0-9A-Za-z]{40}$/);
	});

	it('replacing the link revokes people who joined through the old one', async () => {
		const owner = await createUser();
		const l = await createList(owner, { shareToken: newToken() });
		const guest = await createUser();
		await view(l, guest, true);
		await act('newLink', owner, l);
		const after = await getList(l.id);
		expect(after?.shareToken).not.toBe(l.shareToken);
		expect(after?.shareToken).toBeTruthy();
		expect((await viewerRow(l, guest)).viaLink).toBe(false);
	});

	it('disabling the link clears the token and revokes link viewers', async () => {
		const owner = await createUser();
		const l = await createList(owner, { shareToken: newToken() });
		const guest = await createUser();
		await view(l, guest, true);
		expect(await act('disableLink', owner, l)).toEqual({ kind: 'ok', data: { linkChanged: true } });
		expect((await getList(l.id))?.shareToken).toBeNull();
		expect((await viewerRow(l, guest)).viaLink).toBe(false);
	});

	it('refuses links for Santa lists', async () => {
		const { member, l } = await santaSetup();
		expect(await act('newLink', member, l)).toMatchObject({ kind: 'fail', status: 400 });
		expect((await getList(l.id))?.shareToken).toBeNull();
	});
});

describe('claim actions', () => {
	it('are exposed on the page', () => {
		expect(actions).toHaveProperty('claim');
		expect(actions).toHaveProperty('bought');
		expect(actions).toHaveProperty('unclaim');
	});

	it('lets a guest claim through the list page', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const it = await createItem(owner, {}, { lists: [l] });
		const guest = await createUser();
		expect(await act('claim', guest, l, { itemId: it.id })).toEqual({ kind: 'ok', data: { claimed: it.id } });
		expect(await act('claim', owner, l, { itemId: it.id })).toMatchObject({ kind: 'error', status: 403 });
	});
});

describe('archive and unarchive', () => {
	it('flags a list whose date has passed, and archives and unarchives it', async () => {
		const owner = await createUser();
		const l = await createList(owner, { eventDate: '2020-12-25' });
		const it = await createItem(owner, {}, { lists: [l] });
		const loadFor = () => ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id }, path: `/lists/${l.id}` })));
		expect((await loadFor()).list).toMatchObject({ isPast: true, archived: false });

		expect(await act('archive', owner, l)).toEqual({ kind: 'ok', data: { archived: true } });
		expect((await getList(l.id))?.archivedAt).toBeInstanceOf(Date);
		expect((await loadFor()).list).toMatchObject({ archived: true });
		// Items stay put, on the list and in the library.
		expect(await db.select().from(itemList).where(eq(itemList.itemId, it.id))).toHaveLength(1);

		expect(await act('unarchive', owner, l)).toEqual({ kind: 'ok', data: { unarchived: true } });
		expect((await getList(l.id))?.archivedAt).toBeNull();
	});

	it('does not call an upcoming or undated list past', async () => {
		const owner = await createUser();
		for (const eventDate of ['2999-01-01', null]) {
			const l = await createList(owner, { eventDate });
			const data = await ok<any>(() => (load as any)(fakeEvent({ user: owner, params: { id: l.id }, path: `/lists/${l.id}` })));
			expect(data.list.isPast).toBe(false);
		}
	});

	it('refuses to archive a Santa list', async () => {
		const { member, l } = await santaSetup();
		expect(await act('archive', member, l)).toMatchObject({ kind: 'fail', status: 400 });
		expect((await getList(l.id))?.archivedAt).toBeNull();
	});

	it('still opens an archived list for people it was shared with', async () => {
		const owner = await createUser();
		const guest = await createUser();
		const l = await createList(owner, { archivedAt: new Date() });
		await share(l, guest);
		const data = await ok<any>(() => (load as any)(fakeEvent({ user: guest, params: { id: l.id }, path: `/lists/${l.id}` })));
		expect(data.list.id).toBe(l.id);
	});
});

describe('/lists/[id] link preview', () => {
	it('describes the list for people who can see it', async () => {
		const owner = await createUser({ name: 'Meg' });
		const l = await createList(owner, { title: 'Christmas', visibility: 'public', eventDate: '2020-12-25' });
		await createItem(owner, { title: 'Scarf' }, { lists: [l] });
		const data = await ok<any>(() => (load as any)(fakeEvent({ params: { id: l.id }, path: `/lists/${l.id}` })));
		expect(data.meta).toEqual({ title: 'Christmas', description: "Meg's wish list · 1 item · 25 Dec 2020" });
	});
});
