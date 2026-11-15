import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { addSantaMember, createItem, createList, createSanta, createUser, share } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';
import { load } from '../../src/routes/(app)/lists/+page.server';
import { actions } from '../../src/routes/(app)/lists/new/+page.server';

describe('/lists', () => {
	it('shows my lists without Santa lists, plus friends’ lists and my exchanges', async () => {
		const me = await createUser();
		const mine = await createList(me, { title: 'Mine' });
		await createItem(me, { title: 'Socks' }, { lists: [mine] });
		const s = await createSanta(await createUser());
		const santaList = await addSantaMember(s, me);
		const friend = await createUser();
		const theirs = await createList(friend, { title: 'Theirs' });
		await share(theirs, me);

		const data = await ok<any>(() => (load as any)(fakeEvent({ user: me })));
		expect(data.mine.map((l: any) => l.id)).toEqual([mine.id]);
		expect(data.mine[0]).toMatchObject({ count: 1, preview: ['Socks'] });
		expect(data.mine.map((l: any) => l.id)).not.toContain(santaList.id);
		expect(data.friends.map((l: any) => l.id)).toEqual([theirs.id]);
		expect(data.friends[0].ownerName).toBe(friend.name);
		expect(data.santas.map((x: any) => x.id)).toEqual([s.id]);
	});
});

describe('/lists/new', () => {
	it('creates a list and opens it', async () => {
		const me = await createUser();
		const res = await outcome(() =>
			(actions.default as any)(fakeEvent({ user: me, form: { title: ' Xmas ', description: 'd', eventDate: '2026-12-25', visibility: 'public' } }))
		);
		expect(res).toMatchObject({ kind: 'redirect', status: 303 });
		const id = (res as any).location.replace('/lists/', '');
		const [row] = await db.select().from(list).where(eq(list.id, id));
		expect(row).toMatchObject({ ownerId: me.id, title: 'Xmas', description: 'd', eventDate: '2026-12-25', visibility: 'public', santaId: null });
	});

	it('defaults to private', async () => {
		const me = await createUser();
		const res = (await outcome(() => (actions.default as any)(fakeEvent({ user: me, form: { title: 'P', visibility: 'weird' } })))) as any;
		const [row] = await db.select().from(list).where(eq(list.id, res.location.replace('/lists/', '')));
		expect(row.visibility).toBe('private');
	});

	it('returns validation errors with the entered values', async () => {
		const me = await createUser();
		expect(await outcome(() => (actions.default as any)(fakeEvent({ user: me, form: { title: '', description: 'keep' } })))).toEqual({
			kind: 'fail',
			status: 400,
			data: {
				error: 'Give your list a name.',
				values: { title: '', description: 'keep', eventDate: '', visibility: 'private' }
			}
		});
		expect(
			await outcome(() => (actions.default as any)(fakeEvent({ user: me, form: { title: 't'.repeat(121) } })))
		).toMatchObject({ kind: 'fail', data: { error: 'Keep the name under 120 characters.' } });
	});
});
