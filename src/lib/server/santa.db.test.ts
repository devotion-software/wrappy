import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { item, itemList, list, santaExclusion, santaMember } from './db/schema';
import { exclusionsOf, getSanta, getSantaByToken, joinSanta, leaveSanta, membersOf, mySantas, runDraw } from './santa';
import { createItem, createSanta, createUser, setDrawn } from '../../../tests/helpers/fixtures';
import { outcome } from '../../../tests/helpers/event';

const sent = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('./email', () => ({
	sendSantaAssignmentEmail: vi.fn(async (opts: Record<string, unknown>) => void sent.push(opts)),
	sendListInviteEmail: vi.fn(),
	sendOtpEmail: vi.fn()
}));

beforeEach(() => void (sent.length = 0));

const memberRow = async (santaId: string, userId: string) =>
	(await db.select().from(santaMember).where(and(eq(santaMember.santaId, santaId), eq(santaMember.userId, userId))))[0] ?? null;

async function exchange(n = 3, over: Parameters<typeof createSanta>[1] = {}) {
	const org = await createUser({ name: 'Organiser' });
	const s = await createSanta(org, over);
	const people = [];
	for (let i = 0; i < n; i++) {
		const u = await createUser({ name: `Member ${i}` });
		await joinSanta(s, u.id);
		people.push(u);
	}
	return { org, s: (await getSanta(s.id))!, people };
}

describe('getSanta / getSantaByToken', () => {
	it('finds an exchange by id or join token', async () => {
		const s = await createSanta(await createUser());
		expect((await getSanta(s.id))?.id).toBe(s.id);
		expect((await getSantaByToken(s.joinToken))?.id).toBe(s.id);
		expect(await getSanta('missing')).toBeNull();
		expect(await getSantaByToken('missing')).toBeNull();
	});
});

describe('joinSanta', () => {
	it('adds the member with a private Santa wish list named after the exchange', async () => {
		const s = await createSanta(await createUser(), { name: 'Office 2026' });
		const u = await createUser();
		await joinSanta(s, u.id);
		const m = await memberRow(s.id, u.id);
		expect(m?.listId).toBeTruthy();
		const [l] = await db.select().from(list).where(eq(list.id, m!.listId!));
		expect(l).toMatchObject({ ownerId: u.id, title: 'Office 2026', santaId: s.id, visibility: 'private' });
	});

	it('is idempotent', async () => {
		const s = await createSanta(await createUser());
		const u = await createUser();
		await joinSanta(s, u.id);
		await joinSanta(s, u.id);
		expect(await db.select().from(list).where(and(eq(list.ownerId, u.id), eq(list.santaId, s.id)))).toHaveLength(1);
	});

	it('refuses newcomers after the draw, but is a no-op for existing members', async () => {
		const { s, people } = await exchange(3);
		await setDrawn(s, [
			[people[0], people[1]],
			[people[1], people[2]],
			[people[2], people[0]]
		]);
		const drawn = (await getSanta(s.id))!;
		expect(await outcome(() => joinSanta(drawn, people[0].id))).toEqual({ kind: 'ok', data: undefined });
		const late = await createUser();
		expect(await outcome(() => joinSanta(drawn, late.id))).toMatchObject({ kind: 'error', status: 400 });
		expect(await memberRow(s.id, late.id)).toBeNull();
	});
});

describe('membersOf / exclusionsOf', () => {
	it('lists members in join order with their details', async () => {
		const { s, people } = await exchange(3);
		const ms = await membersOf(s.id);
		expect(ms.map((m) => m.userId)).toEqual(people.map((p) => p.id));
		expect(ms[0]).toMatchObject({ name: 'Member 0', email: people[0].email, assignedToId: null });
		expect(await exclusionsOf(s.id)).toEqual([]);
	});
});

describe('leaveSanta', () => {
	it('removes the member, their exclusions and their Santa list, but keeps their items', async () => {
		const { s, people } = await exchange(3);
		const [a, b, c] = people;
		const m = (await memberRow(s.id, a.id))!;
		const it = await createItem(a, {}, { lists: [{ id: m.listId! }] });
		await db.insert(santaExclusion).values([
			{ santaId: s.id, userA: a.id, userB: b.id },
			{ santaId: s.id, userA: b.id, userB: c.id }
		]);

		await leaveSanta(s, a.id);
		expect(await memberRow(s.id, a.id)).toBeNull();
		expect(await db.select().from(list).where(eq(list.id, m.listId!))).toEqual([]);
		expect(await db.select().from(itemList).where(eq(itemList.itemId, it.id))).toEqual([]);
		expect(await db.select().from(item).where(eq(item.id, it.id))).toHaveLength(1);
		expect(await exclusionsOf(s.id)).toEqual([{ userA: b.id, userB: c.id }]);
	});

	it('is a no-op for non-members', async () => {
		const { s } = await exchange(3);
		await leaveSanta(s, (await createUser()).id);
		expect(await membersOf(s.id)).toHaveLength(3);
	});

	it('refuses after the draw', async () => {
		const { s, people } = await exchange(3);
		await setDrawn(s, [
			[people[0], people[1]],
			[people[1], people[2]],
			[people[2], people[0]]
		]);
		const drawn = (await getSanta(s.id))!;
		expect(await outcome(() => leaveSanta(drawn, people[0].id))).toMatchObject({ kind: 'error', status: 400 });
		expect(await memberRow(s.id, people[0].id)).not.toBeNull();
	});
});

describe('runDraw', () => {
	it('needs at least three people', async () => {
		const { s } = await exchange(2);
		expect(await runDraw(s, 'https://x.test')).toBe('You need at least 3 people to draw names.');
		expect((await getSanta(s.id))!.status).toBe('open');
		expect(sent).toEqual([]);
	});

	it('reports when exclusions make a draw impossible', async () => {
		const { s, people } = await exchange(3);
		const [a, b, c] = people;
		// a can't give to or receive from b or c → impossible.
		await db.insert(santaExclusion).values([
			{ santaId: s.id, userA: a.id, userB: b.id },
			{ santaId: s.id, userA: a.id, userB: c.id }
		]);
		expect(await runDraw(s, 'https://x.test')).toMatch(/impossible/);
		expect((await getSanta(s.id))!.status).toBe('open');
		expect(sent).toEqual([]);
	});

	it('assigns everyone, marks the exchange drawn and emails each member their match', async () => {
		const { s, people } = await exchange(4, { name: 'Family', priceLimit: '25.00', currency: 'GBP', exchangeDate: '2026-12-20' });
		expect(await runDraw(s, 'https://wish.test')).toBeNull();

		const after = (await getSanta(s.id))!;
		expect(after.status).toBe('drawn');
		expect(after.drawnAt).toBeInstanceOf(Date);

		const ms = await membersOf(s.id);
		const receivers = ms.map((m) => m.assignedToId);
		expect(new Set(receivers).size).toBe(4);
		for (const m of ms) {
			expect(m.assignedToId).toBeTruthy();
			expect(m.assignedToId).not.toBe(m.userId);
		}

		expect(sent).toHaveLength(4);
		const byEmail = new Map(sent.map((e) => [e.email, e]));
		for (const m of ms) {
			const mail = byEmail.get(m.email)!;
			const recipient = ms.find((x) => x.userId === m.assignedToId)!;
			expect(mail).toMatchObject({
				santaName: 'Family',
				recipientName: recipient.name,
				budget: '£25',
				url: `https://wish.test/santa/${s.id}`
			});
			expect(mail.exchangeDate).toMatch(/^20 Dec/);
		}
	});

	it('respects exclusions', async () => {
		for (let i = 0; i < 3; i++) {
			const { s, people } = await exchange(4);
			const [a, b, c, d] = people;
			await db.insert(santaExclusion).values([
				{ santaId: s.id, userA: a.id, userB: b.id },
				{ santaId: s.id, userA: c.id, userB: d.id }
			]);
			expect(await runDraw(s, 'https://x.test')).toBeNull();
			const pairs = (await membersOf(s.id)).map((m) => [m.userId, m.assignedToId!].sort().join());
			expect(pairs).not.toContain([a.id, b.id].sort().join());
			expect(pairs).not.toContain([c.id, d.id].sort().join());
		}
	});

	it('refuses to draw twice', async () => {
		const { s } = await exchange(3);
		expect(await runDraw(s, 'https://x.test')).toBeNull();
		sent.length = 0;
		expect(await runDraw((await getSanta(s.id))!, 'https://x.test')).toBe('Names have already been drawn.');
		expect(sent).toEqual([]);
	});

	it('still succeeds when an email fails to send', async () => {
		const email = await import('./email');
		vi.mocked(email.sendSantaAssignmentEmail).mockRejectedValueOnce(new Error('smtp down'));
		const { s } = await exchange(3);
		expect(await runDraw(s, 'https://x.test')).toBeNull();
		expect((await getSanta(s.id))!.status).toBe('drawn');
	});
});

describe('mySantas', () => {
	it('includes exchanges I organise (without playing) and ones I play in', async () => {
		const me = await createUser();
		const organised = await createSanta(me, { priceLimit: '10.00' });
		const { s: playing } = await exchange(2);
		await joinSanta(playing, me.id);
		await createSanta(await createUser()); // someone else's, not mine

		const mine = await mySantas(me.id);
		expect(mine.map((x) => x.id).sort()).toEqual([organised.id, playing.id].sort());
		expect(mine.find((x) => x.id === organised.id)).toMatchObject({
			isOrganiser: true,
			isMember: false,
			memberCount: 0,
			budget: '£10',
			status: 'open',
			recipient: null
		});
		expect(mine.find((x) => x.id === playing.id)).toMatchObject({ isOrganiser: false, isMember: true, memberCount: 3, budget: null });
	});

	it('shows who I am buying for once drawn', async () => {
		const { s, people } = await exchange(3);
		const [a, b, c] = people;
		await setDrawn(s, [
			[a, b],
			[b, c],
			[c, a]
		]);
		const bList = (await memberRow(s.id, b.id))!.listId;
		expect((await mySantas(a.id))[0]).toMatchObject({ status: 'drawn', recipient: { name: b.name, listId: bList } });
	});

	it('is empty for someone with no exchanges', async () => {
		expect(await mySantas((await createUser()).id)).toEqual([]);
	});
});
