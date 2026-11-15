import { describe, expect, it } from 'vitest';
import { addSantaMember, createList, createSanta, createUser, share, uniq, view } from '../helpers/fixtures';
import { fakeEvent, ok } from '../helpers/event';
import { load } from '../../src/routes/(app)/friends/+page.server';
import { db } from '#lib/server/db';
import { list } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';

const search = (me: any, q: string) => ok<any>(() => (load as any)(fakeEvent({ user: me, path: `/friends?q=${encodeURIComponent(q)}` })));

/** A user who shows up in search: has a username and a public list. */
async function findable(name: string, username: string, publicLists = 1) {
	const u = await createUser({ name, username });
	for (let i = 0; i < publicLists; i++) await createList(u, { visibility: 'public' });
	return u;
}

describe('/friends search', () => {
	it('does not search for fewer than 2 characters', async () => {
		const me = await createUser();
		expect(await search(me, ' a ')).toMatchObject({ q: 'a', results: [] });
		expect(await search(me, '')).toMatchObject({ q: '', results: [] });
	});

	it('matches username prefixes and name substrings, counting public lists', async () => {
		const tag = uniq();
		const me = await createUser();
		const byName = await findable(`Anna ${tag} Smith`, `an${uniq()}`, 2);
		const byUser = await findable(`Bob Jones`, `${tag}bob`);
		const res = await search(me, tag);
		expect(res.results).toEqual([
			{ name: byName.name, username: byName.username, lists: 2 },
			{ name: 'Bob Jones', username: byUser.username, lists: 1 }
		]);
		// Usernames match only as a prefix; "@" is ignored.
		expect((await search(me, `@${tag}`)).results.map((r: any) => r.username)).toContain(byUser.username);
		expect((await search(me, `bob${tag}`)).results).toEqual([]);
	});

	it('is case-insensitive', async () => {
		const tag = uniq();
		const me = await createUser();
		await findable(`Case ${tag}`, `cs${uniq()}`);
		expect((await search(me, tag.toUpperCase())).results).toHaveLength(1);
	});

	it('excludes me, people without a username, and people with no public non-Santa lists', async () => {
		const tag = uniq();
		const me = await findable(`Me ${tag}`, `me${uniq()}`);
		await findable(`NoHandle ${tag}`, null as any);
		const privateOnly = await createUser({ name: `Private ${tag}`, username: `pv${uniq()}` });
		await createList(privateOnly);
		const santaOnly = await createUser({ name: `Santa ${tag}`, username: `sn${uniq()}` });
		const sl = await addSantaMember(await createSanta(await createUser()), santaOnly);
		await db.update(list).set({ visibility: 'public' }).where(eq(list.id, sl.id));
		expect((await search(me, tag)).results).toEqual([]);
	});

	it('never matches by email address', async () => {
		const tag = uniq();
		const me = await createUser();
		await createUser({ name: 'Hidden Person', username: `hp${uniq()}`, email: `secret-${tag}@example.test` }).then((u) =>
			createList(u, { visibility: 'public' })
		);
		expect((await search(me, tag)).results).toEqual([]);
		expect((await search(me, `secret-${tag}@example.test`)).results).toEqual([]);
	});

	it('treats LIKE wildcards literally', async () => {
		const tag = uniq();
		const me = await createUser();
		await findable(`Wild ${tag}`, `w${tag}`);
		expect((await search(me, `_${tag.slice(1)}`)).results).toEqual([]);
		expect((await search(me, `%${tag.slice(1)}`)).results).toEqual([]);
		expect((await search(me, `w${tag.slice(0, 2)}%`)).results).toEqual([]);
		const pct = await findable(`100%${tag}`, `pc${uniq()}`);
		expect((await search(me, `0%${tag}`)).results.map((r: any) => r.username)).toEqual([pct.username]);
	});

	it('caps the query at 80 characters', async () => {
		const me = await createUser();
		expect((await search(me, 'x'.repeat(100))).q).toHaveLength(80);
	});
});

describe('/friends shared lists', () => {
	it('lists other people’s lists shared with me or opened by me', async () => {
		const me = await createUser();
		const friend = await createUser();
		const invited = await createList(friend, { title: 'Invited' });
		await share(invited, me);
		const opened = await createList(friend, { visibility: 'public', title: 'Opened' });
		await view(opened, me);
		await createList(friend, { title: 'Not mine to see' });
		const data = await search(me, '');
		expect(data.shared.map((l: any) => l.id).sort()).toEqual([invited.id, opened.id].sort());
		expect(data.shared.every((l: any) => l.ownerName === friend.name)).toBe(true);
	});
});
