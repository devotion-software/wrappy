import { describe, expect, it } from 'vitest';
import { addSantaMember, createItem, createList, createSanta, createUser, uniq } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';
import { load } from '../../src/routes/(app-public)/u/[username]/+page.server';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';

describe('/u/[username]', () => {
	it('shows only public, non-Santa lists, matching the username case-insensitively', async () => {
		const username = `prof${uniq()}`;
		const u = await createUser({ username });
		const pub = await createList(u, { visibility: 'public', title: 'Birthday' });
		await createItem(u, { title: 'Socks' }, { lists: [pub] });
		await createList(u, { visibility: 'private' });
		const santaList = await addSantaMember(await createSanta(await createUser()), u);
		await db.update(list).set({ visibility: 'public' }).where(eq(list.id, santaList.id));

		const data = await ok<any>(() => (load as any)(fakeEvent({ params: { username: username.toUpperCase() } })));
		expect(data.profile).toEqual({ name: u.name, username, isMe: false });
		expect(data.profileUserId).toBe(u.id);
		expect(data.lists).toEqual([
			expect.objectContaining({ id: pub.id, title: 'Birthday', count: 1, preview: ['Socks'], santaId: null, sharedWith: 0 })
		]);
	});

	it('404s for an unknown username', async () => {
		expect(await outcome(() => (load as any)(fakeEvent({ params: { username: `nobody${uniq()}` } })))).toEqual({
			kind: 'error',
			status: 404,
			message: 'No one has that username.'
		});
	});
});
