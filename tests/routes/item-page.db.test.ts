import { describe, expect, it } from 'vitest';
import { newToken } from '#lib/server/ids';
import { linkCookieName } from '#lib/server/access';
import { addImageRow, addLink, claim, createItem, createList, createUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';
import { actions, load } from '../../src/routes/(app-public)/lists/[id]/items/[itemId]/+page.server';

const run = (user: any, listId: string, itemId: string, cookies: Record<string, string> = {}) =>
	outcome(() => (load as any)(fakeEvent({ user, params: { id: listId, itemId }, cookies })));

describe('guest item page', () => {
	it('redirects the owner to their editor, keeping the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await run(owner, l.id, it.id)).toEqual({ kind: 'redirect', status: 303, location: `/items/${it.id}?list=${l.id}` });
	});

	it('shows a guest the wish with its links, pictures and claim', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const it = await createItem(owner, { title: 'Scarf', notes: 'Grey' }, { lists: [l] });
		const l1 = await addLink(it, 'https://shop.example.com/a', 1);
		const l2 = await addLink(it, 'https://shop.example.com/b', 2);
		const i1 = await addImageRow(it, 1);
		const guest = await createUser();
		const buyer = await createUser();
		await claim(it, buyer, 'buying');

		const data = await ok<any>(() => (load as any)(fakeEvent({ user: guest, params: { id: l.id, itemId: it.id } })));
		expect(data.list).toEqual({ id: l.id, title: l.title });
		expect(data.ownerName).toBe(owner.name);
		expect(data.item).toMatchObject({ id: it.id, title: 'Scarf', notes: 'Grey', claim: { status: 'buying', mine: false, byName: buyer.name } });
		expect(data.links).toEqual([
			{ id: l1, url: 'https://shop.example.com/a', label: null },
			{ id: l2, url: 'https://shop.example.com/b', label: null }
		]);
		expect(data.images).toEqual([{ id: i1, storageKey: `items/${it.id}/${i1}`, alt: null }]);
	});

	it('works for a signed-out visitor holding the secret link', async () => {
		const owner = await createUser();
		const token = newToken();
		const l = await createList(owner, { shareToken: token });
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await run(null, l.id, it.id)).toMatchObject({ kind: 'error', status: 404 });
		expect(await run(null, l.id, it.id, { [linkCookieName(l.id)]: token })).toMatchObject({ kind: 'ok' });
	});

	it('404s for an item that is not on this list', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const other = await createList(owner, { visibility: 'public' });
		const it = await createItem(owner, {}, { lists: [other] });
		expect(await run(await createUser(), l.id, it.id)).toEqual({ kind: 'error', status: 404, message: 'This wish is no longer on the list.' });
	});

	it('404s when the viewer cannot see the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await run(await createUser(), l.id, it.id)).toMatchObject({ kind: 'error', status: 404 });
		expect(await run(null, 'missing', it.id)).toMatchObject({ kind: 'error', status: 404 });
	});

	it('offers the claim actions', async () => {
		expect(Object.keys(actions).sort()).toEqual(['bought', 'claim', 'unclaim']);
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const it = await createItem(owner, {}, { lists: [l] });
		const guest = await createUser();
		expect(
			await outcome(() => (actions.bought as any)(fakeEvent({ user: guest, params: { id: l.id, itemId: it.id }, form: { itemId: it.id } })))
		).toEqual({ kind: 'ok', data: { claimed: it.id } });
	});
});
