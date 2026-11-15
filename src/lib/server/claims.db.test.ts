import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { itemClaim } from './db/schema';
import { claimActions } from './claims';
import { addToList, claim, createItem, createList, createUser, share, type TestUser } from '../../../tests/helpers/fixtures';
import { fakeEvent, outcome } from '../../../tests/helpers/event';

const act = (name: keyof typeof claimActions, user: TestUser | null, listId: string, itemId: string) =>
	outcome(() => claimActions[name](fakeEvent({ user, params: { id: listId }, form: { itemId } })));

const claimOf = async (itemId: string) => (await db.select().from(itemClaim).where(eq(itemClaim.itemId, itemId)))[0] ?? null;

async function setup() {
	const [owner, sam, priya] = [await createUser(), await createUser(), await createUser()];
	const l = await createList(owner, { visibility: 'public' });
	const it = await createItem(owner, {}, { lists: [l] });
	return { owner, sam, priya, l, it };
}

describe('claimActions', () => {
	it('sends signed-out visitors to sign in, then back to the list', async () => {
		const { l, it } = await setup();
		expect(await act('claim', null, l.id, it.id)).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/signin?next=${encodeURIComponent(`/lists/${l.id}`)}`
		});
		expect(await claimOf(it.id)).toBeNull();
	});

	it('404s when the guest cannot see the list', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await act('claim', await createUser(), l.id, it.id)).toMatchObject({ kind: 'error', status: 404 });
		expect(await claimOf(it.id)).toBeNull();
	});

	it('lets invited guests claim on private lists', async () => {
		const owner = await createUser();
		const guest = await createUser();
		const l = await createList(owner);
		await share(l, guest);
		const it = await createItem(owner, {}, { lists: [l] });
		expect(await act('claim', guest, l.id, it.id)).toEqual({ kind: 'ok', data: { claimed: it.id } });
	});

	it('forbids the owner from claiming on their own list', async () => {
		const { owner, l, it } = await setup();
		for (const a of ['claim', 'bought', 'unclaim'] as const) {
			expect(await act(a, owner, l.id, it.id)).toMatchObject({ kind: 'error', status: 403 });
		}
	});

	it('404s for an item that is not on that list', async () => {
		const { owner, sam, l } = await setup();
		const offList = await createItem(owner);
		expect(await act('claim', sam, l.id, offList.id)).toMatchObject({ kind: 'error', status: 404 });
		expect(await act('claim', sam, l.id, '')).toMatchObject({ kind: 'error', status: 404 });
		expect(await claimOf(offList.id)).toBeNull();
	});

	it('reserves an item, then upgrades it to bought', async () => {
		const { sam, l, it } = await setup();
		expect(await act('claim', sam, l.id, it.id)).toEqual({ kind: 'ok', data: { claimed: it.id } });
		expect(await claimOf(it.id)).toMatchObject({ userId: sam.id, status: 'buying' });
		expect(await act('bought', sam, l.id, it.id)).toEqual({ kind: 'ok', data: { claimed: it.id } });
		expect(await claimOf(it.id)).toMatchObject({ userId: sam.id, status: 'bought' });
		// And back again.
		await act('claim', sam, l.id, it.id);
		expect(await claimOf(it.id)).toMatchObject({ status: 'buying' });
	});

	it('can mark bought straight away', async () => {
		const { sam, l, it } = await setup();
		await act('bought', sam, l.id, it.id);
		expect(await claimOf(it.id)).toMatchObject({ userId: sam.id, status: 'bought' });
	});

	it('reports a conflict when someone else already claimed it, leaving their claim alone', async () => {
		const { sam, priya, l, it } = await setup();
		await claim(it, sam, 'buying');
		for (const a of ['claim', 'bought'] as const) {
			expect(await act(a, priya, l.id, it.id)).toEqual({
				kind: 'fail',
				status: 409,
				data: { claimError: { itemId: it.id, message: 'Someone else got there first.' } }
			});
		}
		expect(await claimOf(it.id)).toMatchObject({ userId: sam.id, status: 'buying' });
	});

	it('only one of two simultaneous claims wins', async () => {
		const { sam, priya, l, it } = await setup();
		const results = await Promise.all([act('claim', sam, l.id, it.id), act('claim', priya, l.id, it.id)]);
		expect(results.filter((r) => r.kind === 'ok')).toHaveLength(1);
		expect(results.filter((r) => r.kind === 'fail')).toHaveLength(1);
	});

	it("unclaim removes only the guest's own claim", async () => {
		const { sam, priya, l, it } = await setup();
		await claim(it, sam, 'bought');
		expect(await act('unclaim', priya, l.id, it.id)).toEqual({ kind: 'ok', data: { unclaimed: it.id } });
		expect(await claimOf(it.id)).toMatchObject({ userId: sam.id });
		expect(await act('unclaim', sam, l.id, it.id)).toEqual({ kind: 'ok', data: { unclaimed: it.id } });
		expect(await claimOf(it.id)).toBeNull();
	});

	it('a claim made on one list holds on every list the item is on', async () => {
		const { owner, sam, priya, l, it } = await setup();
		const other = await createList(owner, { visibility: 'public' });
		await addToList(other, it);
		await act('claim', sam, l.id, it.id);
		expect(await act('claim', priya, other.id, it.id)).toMatchObject({ kind: 'fail', status: 409 });
	});
});
