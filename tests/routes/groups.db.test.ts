import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { friendGroup } from '#lib/server/db/schema';
import { createGroup, groupMembers, joinGroup } from '#lib/server/groups';
import { createUser, uniq, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

vi.mock('#lib/server/email', () => ({
	sendGroupInviteEmail: vi.fn(async () => {}),
	sendListInviteEmail: vi.fn(async () => {})
}));
vi.mock('#lib/server/rateLimit', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/rateLimit')>()),
	takeGroupInviteBudget: vi.fn(async () => true)
}));

import { load as groupLoad, actions as groupActions } from '../../src/routes/(app)/groups/[id]/+page.server';
import { load as joinLoad, actions as joinActions } from '../../src/routes/(app-public)/groups/join/[token]/+page.server';
import { load as friendsLoad, actions as friendsActions } from '../../src/routes/(app)/friends/+page.server';
import { sendGroupInviteEmail } from '#lib/server/email';
import { takeGroupInviteBudget } from '#lib/server/rateLimit';

const mockInvite = vi.mocked(sendGroupInviteEmail);
const mockBudget = vi.mocked(takeGroupInviteBudget);
beforeEach(() => {
	vi.clearAllMocks();
	mockBudget.mockResolvedValue(true);
});

const groupRow = async (id: string) => (await db.select().from(friendGroup).where(eq(friendGroup.id, id)))[0];
const act = (name: keyof typeof groupActions, user: TestUser, id: string, form: Record<string, string> = {}) =>
	outcome(() => (groupActions[name] as any)(fakeEvent({ user, params: { id }, form, path: `/groups/${id}` })));
const join = (user: TestUser | null, token: string) =>
	outcome(() => (joinActions.default as any)(fakeEvent({ user, params: { token }, form: {}, path: `/groups/join/${token}` })));

async function family() {
	const meg = await createUser({ name: 'Meg', username: `meg${uniq()}` });
	const sam = await createUser({ name: 'Sam' });
	const id = await createGroup(meg.id, 'Family');
	const g = await groupRow(id);
	await joinGroup(g, sam.id);
	return { meg, sam, g };
}

describe('Friends: groups', () => {
	it('creates a group and sends you to it', async () => {
		const me = await createUser();
		const res = await outcome(() => (friendsActions.createGroup as any)(fakeEvent({ user: me, form: { name: ' Book club ' } })));
		expect(res).toMatchObject({ kind: 'redirect', status: 303 });
		const id = (res as any).location.split('/').pop();
		expect(await groupRow(id)).toMatchObject({ name: 'Book club', ownerId: me.id });
		const data = await ok<any>(() => (friendsLoad as any)(fakeEvent({ user: me, path: '/friends' })));
		expect(data.groups).toEqual([{ id, name: 'Book club', members: 1, isOwner: true }]);
	});

	it('needs a name', async () => {
		const me = await createUser();
		expect(await outcome(() => (friendsActions.createGroup as any)(fakeEvent({ user: me, form: { name: ' ' } })))).toMatchObject({
			kind: 'fail',
			data: { groupError: expect.any(String) }
		});
	});
});

describe('/groups/[id]', () => {
	it('shows members (names only) to people in the group, and 404s for everyone else', async () => {
		const { meg, sam, g } = await family();
		const data = await ok<any>(() => (groupLoad as any)(fakeEvent({ user: sam, params: { id: g.id } })));
		expect(data).toMatchObject({ group: { id: g.id, name: 'Family', joinToken: g.joinToken }, isOwner: false, ownerId: meg.id });
		expect(data.members.map((m: any) => m.name).sort()).toEqual(['Meg', 'Sam']);
		expect(JSON.stringify(data)).not.toContain(meg.email);
		const stranger = await createUser();
		expect(await outcome(() => (groupLoad as any)(fakeEvent({ user: stranger, params: { id: g.id } })))).toMatchObject({
			kind: 'error',
			status: 404
		});
	});

	it('lets anyone in the group invite by email, with checks and a rate limit', async () => {
		const { sam, g } = await family();
		expect(await act('invite', sam, g.id, { email: 'New@Example.test' })).toEqual({ kind: 'ok', data: { invited: 'new@example.test' } });
		expect(mockInvite).toHaveBeenCalledWith({
			email: 'new@example.test',
			inviterName: 'Sam',
			groupName: 'Family',
			url: `http://localhost:5182/groups/join/${g.joinToken}`
		});
		expect(await act('invite', sam, g.id, { email: 'nope' })).toMatchObject({ kind: 'fail', status: 400 });
		expect(await act('invite', sam, g.id, { email: sam.email })).toMatchObject({ kind: 'fail', status: 400 });
		mockBudget.mockResolvedValueOnce(false);
		expect(await act('invite', sam, g.id, { email: 'x@example.test' })).toMatchObject({ kind: 'fail', status: 429 });
		expect(mockInvite).toHaveBeenCalledTimes(1);
		const stranger = await createUser();
		expect(await act('invite', stranger, g.id, { email: 'x@example.test' })).toMatchObject({ kind: 'error', status: 404 });
	});

	it('only the owner can rename, remove people, reset the link or delete', async () => {
		const { meg, sam, g } = await family();
		for (const [name, form] of [
			['rename', { name: 'Fam' }],
			['remove', { userId: meg.id }],
			['resetLink', {}],
			['delete', {}]
		] as const) {
			expect(await act(name, sam, g.id, form)).toMatchObject({ kind: 'error', status: 403 });
		}
		expect(await act('rename', meg, g.id, { name: 'The Family' })).toMatchObject({ kind: 'ok' });
		expect(await act('rename', meg, g.id, { name: '' })).toMatchObject({ kind: 'fail' });
		expect(await act('resetLink', meg, g.id)).toMatchObject({ kind: 'ok' });
		const after = await groupRow(g.id);
		expect(after.name).toBe('The Family');
		expect(after.joinToken).not.toBe(g.joinToken);
		expect(await act('remove', meg, g.id, { userId: sam.id })).toMatchObject({ kind: 'ok' });
		expect((await groupMembers(g.id)).map((m) => m.name)).toEqual(['Meg']);
		expect(await act('delete', meg, g.id)).toMatchObject({ kind: 'redirect', location: '/friends#groups' });
		expect(await groupRow(g.id)).toBeUndefined();
	});

	it('anyone can leave', async () => {
		const { sam, g } = await family();
		expect(await act('leave', sam, g.id)).toMatchObject({ kind: 'redirect', location: '/friends#groups' });
		expect((await groupMembers(g.id)).map((m) => m.name)).toEqual(['Meg']);
	});
});

describe('/groups/join/[token]', () => {
	it('shows who invited you and who is in it', async () => {
		const { g } = await family();
		const data = await ok<any>(() => (joinLoad as any)(fakeEvent({ params: { token: g.joinToken } })));
		expect(data).toMatchObject({ group: { name: 'Family' }, ownerName: 'Meg' });
		expect(data.members.map((m: any) => m.name).sort()).toEqual(['Meg', 'Sam']);
	});

	it('sends members straight to the group, and 404s for an old link', async () => {
		const { sam, g } = await family();
		expect(await outcome(() => (joinLoad as any)(fakeEvent({ user: sam, params: { token: g.joinToken } })))).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/groups/${g.id}`
		});
		expect(await outcome(() => (joinLoad as any)(fakeEvent({ params: { token: 'old' } })))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('asks signed-out visitors to log in, then joins', async () => {
		const { g } = await family();
		expect(await join(null, g.joinToken)).toEqual({
			kind: 'redirect',
			status: 303,
			location: `/signin?next=${encodeURIComponent(`/groups/join/${g.joinToken}`)}`
		});
		const zoe = await createUser({ name: 'Zoe' });
		expect(await join(zoe, g.joinToken)).toEqual({ kind: 'redirect', status: 303, location: `/groups/${g.id}` });
		expect((await groupMembers(g.id)).map((m) => m.name)).toContain('Zoe');
		expect(await join(zoe, 'old')).toMatchObject({ kind: 'error', status: 404 });
	});
});
