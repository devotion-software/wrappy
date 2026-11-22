import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const sendListInviteEmail = vi.hoisted(() => vi.fn(async (_opts: unknown) => {}));
vi.mock('./email', () => ({ sendListInviteEmail }));

import { db } from './db';
import { friendGroup, friendGroupMember, listShare } from './db/schema';
import {
	MAX_GROUP_MEMBERS,
	createGroup,
	getGroupByToken,
	groupForMember,
	groupMembers,
	joinGroup,
	leaveGroup,
	myGroups,
	parseGroupName,
	removeMember,
	shareListWithGroup
} from './groups';
import { createList, createUser, share, type TestUser } from '../../../tests/helpers/fixtures';
import { outcome } from '../../../tests/helpers/event';

const row = async (id: string) => (await db.select().from(friendGroup).where(eq(friendGroup.id, id)))[0] ?? null;
const sharesOf = (listId: string) => db.select().from(listShare).where(eq(listShare.listId, listId));

/** Meg runs "Family"; Sam and Ann are in it. */
async function family() {
	const [meg, sam, ann] = [await createUser({ name: 'Meg' }), await createUser({ name: 'Sam' }), await createUser({ name: 'Ann' })];
	const id = await createGroup(meg.id, 'Family');
	const g = (await row(id))!;
	await joinGroup(g, sam.id);
	await joinGroup(g, ann.id);
	return { meg, sam, ann, g };
}

beforeEach(() => sendListInviteEmail.mockClear());

describe('parseGroupName', () => {
	it('needs a name under 80 characters', () => {
		expect(parseGroupName('  Family ')).toEqual({ name: 'Family' });
		expect(parseGroupName('')).toHaveProperty('error');
		expect(parseGroupName(null)).toHaveProperty('error');
		expect(parseGroupName('x'.repeat(81))).toHaveProperty('error');
	});
});

describe('groups', () => {
	it('the creator is in the group they make, and everyone sees member counts', async () => {
		const { meg, sam, g } = await family();
		expect(g).toMatchObject({ name: 'Family', ownerId: meg.id });
		expect(g.joinToken).toHaveLength(40);
		expect(await myGroups(meg.id)).toEqual([{ id: g.id, name: 'Family', members: 3, isOwner: true }]);
		expect(await myGroups(sam.id)).toEqual([{ id: g.id, name: 'Family', members: 3, isOwner: false }]);
		expect(await myGroups((await createUser()).id)).toEqual([]);
	});

	it('finds a group by its join token', async () => {
		const { g } = await family();
		expect((await getGroupByToken(g.joinToken))?.id).toBe(g.id);
		expect(await getGroupByToken('nope')).toBeNull();
	});

	it('joining twice is harmless', async () => {
		const { sam, g } = await family();
		expect(await joinGroup(g, sam.id)).toBe(true);
		expect(await groupMembers(g.id)).toHaveLength(3);
	});

	it('stops people joining a full group', async () => {
		const owner = await createUser();
		const g = (await row(await createGroup(owner.id, 'Big')))!;
		const others = await Promise.all(Array.from({ length: MAX_GROUP_MEMBERS - 1 }, () => createUser()));
		await db.insert(friendGroupMember).values(others.map((u) => ({ groupId: g.id, userId: u.id })));
		expect(await joinGroup(g, (await createUser()).id)).toBe(false);
		expect(await joinGroup(g, others[0].id)).toBe(true);
	});

	it('only shows a group to people in it', async () => {
		const { sam, g } = await family();
		expect((await groupForMember(g.id, sam.id)).id).toBe(g.id);
		expect(await outcome(() => groupForMember(g.id, 'someone-else'))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => groupForMember('missing', sam.id))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('lists members by name and username, never email', async () => {
		const { g } = await family();
		const members = await groupMembers(g.id);
		expect(members.map((m) => m.name).sort()).toEqual(['Ann', 'Meg', 'Sam']);
		for (const m of members) expect(Object.keys(m).sort()).toEqual(['id', 'joinedAt', 'name', 'username']);
	});

	it('a member can leave', async () => {
		const { sam, g } = await family();
		await leaveGroup(g, sam.id);
		expect((await groupMembers(g.id)).map((m) => m.name).sort()).toEqual(['Ann', 'Meg']);
	});

	it('when the owner leaves, whoever joined first takes over; the last one out deletes it', async () => {
		const { meg, sam, ann, g } = await family();
		// Joins in the same millisecond would tie; make the order explicit.
		await db.update(friendGroupMember).set({ joinedAt: new Date(Date.now() + 1000) }).where(eq(friendGroupMember.userId, ann.id));
		await leaveGroup(g, meg.id);
		const after = (await row(g.id))!;
		expect(after.ownerId).toBe(sam.id);
		await leaveGroup(after, sam.id);
		const last = (await row(g.id))!;
		expect(last.ownerId).toBe(ann.id);
		await leaveGroup(last, ann.id);
		expect(await row(g.id)).toBeNull();
	});

	it('removes members, but not the owner', async () => {
		const { meg, sam, g } = await family();
		await removeMember(g, sam.id);
		await removeMember(g, meg.id);
		expect((await groupMembers(g.id)).map((m) => m.name).sort()).toEqual(['Ann', 'Meg']);
	});
});

describe('shareListWithGroup', () => {
	it('invites everyone else in the group, marks them as from the group, and emails each once', async () => {
		const { meg, sam, ann, g } = await family();
		const l = await createList(meg, { title: 'Birthday' });
		expect(await shareListWithGroup(l, meg, g.id, 'https://wrappy.example')).toBe(2);
		const rows = await sharesOf(l.id);
		expect(rows.map((r) => r.userId).sort()).toEqual([sam.id, ann.id].sort());
		for (const r of rows) expect(r.groupId).toBe(g.id);
		expect(sendListInviteEmail).toHaveBeenCalledTimes(2);
		expect(sendListInviteEmail.mock.calls.map(([o]: any) => o.email).sort()).toEqual([sam.email, ann.email].sort());
		expect(sendListInviteEmail.mock.calls[0][0]).toMatchObject({ ownerName: 'Meg', listTitle: 'Birthday' });

		// Sharing again only adds people who joined since.
		sendListInviteEmail.mockClear();
		const zoe = await createUser();
		await joinGroup(g, zoe.id);
		expect(await shareListWithGroup(l, meg, g.id, 'https://wrappy.example')).toBe(1);
		expect(sendListInviteEmail).toHaveBeenCalledTimes(1);
		expect(await sharesOf(l.id)).toHaveLength(3);
	});

	it('skips people already invited by email, and the list owner', async () => {
		const { meg, sam, g } = await family();
		const l = await createList(meg);
		await share(l, { email: sam.email });
		expect(await shareListWithGroup(l, meg, g.id, 'https://wrappy.example')).toBe(1);
		const rows = await sharesOf(l.id);
		expect(rows).toHaveLength(2);
		expect(rows.find((r) => r.email === sam.email)?.groupId).toBeNull();
		expect(rows.some((r) => r.userId === meg.id)).toBe(false);
	});

	it('only works for groups the sharer is in', async () => {
		const { g } = await family();
		const outsider: TestUser = await createUser();
		const l = await createList(outsider);
		expect(await outcome(() => shareListWithGroup(l, outsider, g.id, 'https://wrappy.example'))).toMatchObject({ kind: 'error', status: 404 });
		expect(await sharesOf(l.id)).toEqual([]);
	});

	it('keeps the shares when the group is deleted', async () => {
		const { meg, g } = await family();
		const l = await createList(meg);
		await shareListWithGroup(l, meg, g.id, 'https://wrappy.example');
		await db.delete(friendGroup).where(eq(friendGroup.id, g.id));
		const rows = await sharesOf(l.id);
		expect(rows).toHaveLength(2);
		for (const r of rows) expect(r.groupId).toBeNull();
	});
});
