import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemList, list, santa, santaExclusion, santaMember } from '#lib/server/db/schema';
import {
	addSantaMember,
	createItem,
	createList,
	createSanta,
	createUser,
	setDrawn,
	type TestUser
} from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const email = vi.hoisted(() => ({ sendSantaAssignmentEmail: vi.fn(), failing: false }));
vi.mock('#lib/server/email', () => ({
	// A plain wrapper, so a failing send is an ordinary rejected promise rather than a spy result.
	sendSantaAssignmentEmail: async (opts: unknown) => {
		email.sendSantaAssignmentEmail(opts);
		if (email.failing) throw new Error('smtp down');
	},
	sendOtpEmail: vi.fn(),
	sendListInviteEmail: vi.fn()
}));

const { load, actions } = await import('../../src/routes/(app)/santa/[id]/+page.server');

beforeEach(() => {
	email.sendSantaAssignmentEmail.mockReset();
	email.failing = false;
});

const ev = (me: TestUser, id: string, form?: Record<string, string>) =>
	fakeEvent({ user: me, params: { id }, path: `/santa/${id}`, form });
const getS = async (id: string) => (await db.select().from(santa).where(eq(santa.id, id)))[0];
const memberIds = async (id: string) =>
	(await db.select().from(santaMember).where(eq(santaMember.santaId, id))).map((m) => m.userId).sort();
const exclusions = (id: string) =>
	db.select({ a: santaExclusion.userA, b: santaExclusion.userB }).from(santaExclusion).where(eq(santaExclusion.santaId, id));

/** Organiser (not playing) + three players. */
async function scene(over: Partial<typeof santa.$inferInsert> = {}) {
	const org = await createUser({ name: 'Olive' });
	const a = await createUser({ name: 'Ann' });
	const b = await createUser({ name: 'Bob' });
	const c = await createUser({ name: 'Cat' });
	const s = await createSanta(org, { name: 'Office', ...over });
	const la = await addSantaMember(s, a);
	const lb = await addSantaMember(s, b);
	const lc = await addSantaMember(s, c);
	return { org, a, b, c, s, la, lb, lc };
}

describe('/santa/[id] load', () => {
	it('404s for people outside the exchange, and for unknown ids', async () => {
		const { s } = await scene();
		const stranger = await createUser();
		expect(await outcome(() => load(ev(stranger, s.id)))).toMatchObject({ kind: 'error', status: 404 });
		expect(await outcome(() => load(ev(stranger, 'missing')))).toMatchObject({ kind: 'error', status: 404 });
	});

	it('never sends other members’ assignments; only my own recipient', async () => {
		const { s, a, b, c, lb } = await scene();
		await setDrawn(s, [
			[a, b],
			[b, c],
			[c, a]
		]);
		const data = await ok<any>(() => load(ev(a, s.id)));
		expect(data.members).toEqual([
			{ id: a.id, name: 'Ann' },
			{ id: b.id, name: 'Bob' },
			{ id: c.id, name: 'Cat' }
		]);
		expect(data.recipient).toEqual({ name: 'Bob', listId: lb.id });
		expect(JSON.stringify(data)).not.toContain('assignedToId');
		expect(data.organiser).toBeNull();
		expect(data.santa.status).toBe('drawn');
	});

	it('gives the organiser the join link and exclusions with names sorted, but no recipient', async () => {
		const { s, org, a, c } = await scene();
		const [x, y] = [c.id, a.id].sort();
		await db.insert(santaExclusion).values({ santaId: s.id, userA: x, userB: y });
		const data = await ok<any>(() => load(ev(org, s.id)));
		expect(data.isOrganiser).toBe(true);
		expect(data.me).toBeNull();
		expect(data.recipient).toBeNull();
		expect(data.wishes).toEqual([]);
		expect(data.organiserName).toBe('Olive');
		expect(data.organiser).toEqual({ joinToken: s.joinToken, exclusions: [{ a: x, b: y, aName: 'Ann', bName: 'Cat' }] });
	});

	it('lists my wishes with whether they are on my Santa list and fit the budget', async () => {
		const { s, a, la } = await scene({ priceLimit: '20.00', currency: 'GBP' });
		const on = await createItem(a, { title: 'A on list', price: '10.00' }, { lists: [la] });
		const free = await createItem(a, { title: 'B unpriced' });
		const exact = await createItem(a, { title: 'C exact', price: '20.00' });
		const over = await createItem(a, { title: 'D over', price: '20.01' });
		const euro = await createItem(a, { title: 'E euro', price: '5.00', currency: 'EUR' });
		const data = await ok<any>(() => load(ev(a, s.id)));
		expect(data.me).toEqual({ listId: la.id });
		expect(data.wishes.map((w: any) => [w.id, w.onList, w.fits])).toEqual([
			[on.id, true, true],
			[free.id, false, true],
			[exact.id, false, true],
			[over.id, false, false],
			[euro.id, false, false]
		]);
	});

	it('treats every wish as fitting when there is no budget', async () => {
		const { s, a } = await scene();
		await createItem(a, { price: '999.00', currency: 'USD' });
		const data = await ok<any>(() => load(ev(a, s.id)));
		expect(data.wishes.every((w: any) => w.fits)).toBe(true);
	});
});

describe('organiser-only actions', () => {
	it.each(['update', 'addExclusion', 'removeExclusion', 'removeMember', 'draw', 'deleteSanta'] as const)(
		'%s is refused for a member',
		async (name) => {
			const { s, a, b } = await scene();
			const o = await outcome(() => (actions as any)[name](ev(a, s.id, { name: 'Hacked', a: a.id, b: b.id, userId: b.id })));
			expect(o).toMatchObject({ kind: 'error', status: 403 });
			expect((await getS(s.id)).name).toBe('Office');
			expect(await memberIds(s.id)).toHaveLength(3);
		}
	);
});

describe('update', () => {
	it('validates and saves settings while open', async () => {
		const { s, org } = await scene();
		expect(await outcome(() => actions.update(ev(org, s.id, { name: '' })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { settingsError: 'Give your Secret Santa a name.' }
		});
		await ok(() => actions.update(ev(org, s.id, { name: 'Renamed', priceLimit: '30', currency: 'USD' })));
		expect(await getS(s.id)).toMatchObject({ name: 'Renamed', priceLimit: '30.00', currency: 'USD' });
	});

	it('locks budget and currency after the draw', async () => {
		const { s, org } = await scene({ priceLimit: '20.00', currency: 'GBP' });
		await setDrawn(s, []);
		await ok(() => actions.update(ev(org, s.id, { name: 'After', priceLimit: '100', currency: 'EUR', description: 'New rules' })));
		expect(await getS(s.id)).toMatchObject({ name: 'After', description: 'New rules', priceLimit: '20.00', currency: 'GBP' });
	});
});

describe('exclusions', () => {
	it('stores a pair in id order, once', async () => {
		const { s, org, a, b } = await scene();
		await ok(() => actions.addExclusion(ev(org, s.id, { a: b.id, b: a.id })));
		await ok(() => actions.addExclusion(ev(org, s.id, { a: a.id, b: b.id })));
		const [x, y] = [a.id, b.id].sort();
		expect(await exclusions(s.id)).toEqual([{ a: x, b: y }]);
		expect(await ok(() => actions.removeExclusion(ev(org, s.id, { a: x, b: y })))).toEqual({ excluded: true });
		expect(await exclusions(s.id)).toEqual([]);
	});

	it('needs two different members', async () => {
		const { s, org, a } = await scene();
		const outsider = await createUser();
		for (const form of [{ a: a.id, b: a.id }, { a: a.id, b: outsider.id }, { a: '', b: '' }]) {
			expect(await outcome(() => actions.addExclusion(ev(org, s.id, form)))).toEqual({
				kind: 'fail',
				status: 400,
				data: { exclusionError: 'Pick two different people.' }
			});
		}
		expect(await exclusions(s.id)).toEqual([]);
	});

	it('cannot change after the draw', async () => {
		const { s, org, a, b } = await scene();
		await setDrawn(s, []);
		expect(await outcome(() => actions.addExclusion(ev(org, s.id, { a: a.id, b: b.id })))).toMatchObject({ kind: 'error', status: 400 });
		expect(await outcome(() => actions.removeExclusion(ev(org, s.id, { a: a.id, b: b.id })))).toMatchObject({
			kind: 'error',
			status: 400
		});
	});
});

describe('removeMember', () => {
	it('removes the member, their exclusions and Santa list, but keeps their items', async () => {
		const { s, org, a, b, c, lb } = await scene();
		const [x, y] = [a.id, b.id].sort();
		await db.insert(santaExclusion).values({ santaId: s.id, userA: x, userB: y });
		const wish = await createItem(b, {}, { lists: [lb] });
		expect(await ok(() => actions.removeMember(ev(org, s.id, { userId: b.id })))).toEqual({ removed: true });
		expect(await memberIds(s.id)).toEqual([a.id, c.id].sort());
		expect(await exclusions(s.id)).toEqual([]);
		expect(await db.select().from(list).where(eq(list.id, lb.id))).toEqual([]);
		expect(await db.select().from(item).where(eq(item.id, wish.id))).toHaveLength(1);
	});

	it('is refused after the draw', async () => {
		const { s, org, b } = await scene();
		await setDrawn(s, []);
		expect(await outcome(() => actions.removeMember(ev(org, s.id, { userId: b.id })))).toMatchObject({ kind: 'error', status: 400 });
	});
});

describe('draw', () => {
	it('needs at least three people', async () => {
		const org = await createUser();
		const s = await createSanta(org);
		await addSantaMember(s, await createUser());
		await addSantaMember(s, await createUser());
		expect(await outcome(() => actions.draw(ev(org, s.id, {})))).toEqual({
			kind: 'fail',
			status: 400,
			data: { drawError: 'You need at least 3 people to draw names.' }
		});
		expect((await getS(s.id)).status).toBe('open');
	});

	it('reports impossible exclusions', async () => {
		const { s, org, a, b, c } = await scene();
		for (const [p, q] of [
			[a, b],
			[a, c]
		]) {
			const [x, y] = [p.id, q.id].sort();
			await db.insert(santaExclusion).values({ santaId: s.id, userA: x, userB: y });
		}
		expect(await outcome(() => actions.draw(ev(org, s.id, {})))).toMatchObject({
			kind: 'fail',
			status: 400,
			data: { drawError: expect.stringContaining('impossible') }
		});
		expect(email.sendSantaAssignmentEmail).not.toHaveBeenCalled();
	});

	it('assigns everyone, marks the exchange drawn and emails each member', async () => {
		const { s, org, a, b, c } = await scene({ priceLimit: '20.00' });
		expect(await ok(() => actions.draw(ev(org, s.id, {})))).toEqual({ drawn: true });
		const rows = await db.select().from(santaMember).where(eq(santaMember.santaId, s.id));
		const ids = [a.id, b.id, c.id].sort();
		expect(rows.map((r) => r.assignedToId).sort()).toEqual(ids);
		for (const r of rows) expect(r.assignedToId).not.toBe(r.userId);
		expect(await getS(s.id)).toMatchObject({ status: 'drawn', drawnAt: expect.any(Date) });
		expect(email.sendSantaAssignmentEmail).toHaveBeenCalledTimes(3);
		expect(email.sendSantaAssignmentEmail.mock.calls.map(([m]) => m.email).sort()).toEqual([a.email, b.email, c.email].sort());
		expect(email.sendSantaAssignmentEmail).toHaveBeenCalledWith(
			expect.objectContaining({ santaName: 'Office', budget: '£20', url: `http://localhost:5182/santa/${s.id}` })
		);

		// Drawing again is refused.
		expect(await outcome(() => actions.draw(ev(org, s.id, {})))).toEqual({
			kind: 'fail',
			status: 400,
			data: { drawError: 'Names have already been drawn.' }
		});
	});

	it('still succeeds if an email fails', async () => {
		const { s, org } = await scene();
		email.failing = true;
		expect(await ok(() => actions.draw(ev(org, s.id, {})))).toEqual({ drawn: true });
		expect(email.sendSantaAssignmentEmail).toHaveBeenCalledTimes(3);
		expect((await getS(s.id)).status).toBe('drawn');
	});
});

describe('deleteSanta', () => {
	it('removes the exchange and Santa lists, keeps items and other lists, and redirects', async () => {
		const { s, org, a, la } = await scene();
		const other = await createList(a);
		const wish = await createItem(a, {}, { lists: [la, other] });
		expect(await outcome(() => actions.deleteSanta(ev(org, s.id, {})))).toEqual({ kind: 'redirect', status: 303, location: '/santa' });
		expect(await getS(s.id)).toBeUndefined();
		expect(await db.select().from(list).where(eq(list.santaId, s.id))).toEqual([]);
		expect(await memberIds(s.id)).toEqual([]);
		expect(await db.select().from(item).where(eq(item.id, wish.id))).toHaveLength(1);
		expect((await db.select().from(itemList).where(eq(itemList.itemId, wish.id))).map((r) => r.listId)).toEqual([other.id]);
	});
});

describe('join / leave', () => {
	it('lets the organiser join their own exchange', async () => {
		const { s, org } = await scene();
		expect(await ok(() => actions.join(ev(org, s.id, {})))).toEqual({ joined: true });
		expect(await memberIds(s.id)).toContain(org.id);
	});

	it('lets a member leave while open', async () => {
		const { s, a, la } = await scene();
		expect(await outcome(() => actions.leave(ev(a, s.id, {})))).toEqual({ kind: 'redirect', status: 303, location: '/santa' });
		expect(await memberIds(s.id)).not.toContain(a.id);
		expect(await db.select().from(list).where(eq(list.id, la.id))).toEqual([]);
	});

	it('refuses leaving after the draw', async () => {
		const { s, a } = await scene();
		await setDrawn(s, []);
		expect(await outcome(() => actions.leave(ev(a, s.id, {})))).toMatchObject({ kind: 'error', status: 400 });
		expect(await memberIds(s.id)).toContain(a.id);
	});
});

describe('toggleWish', () => {
	const onList = async (listId: string, itemId: string) =>
		(await db.select().from(itemList).where(and(eq(itemList.listId, listId), eq(itemList.itemId, itemId)))).length === 1;

	it('is for members only', async () => {
		const { s, org } = await scene();
		const it = await createItem(org);
		expect(await outcome(() => actions.toggleWish(ev(org, s.id, { itemId: it.id, on: '1' })))).toMatchObject({
			kind: 'error',
			status: 400
		});
	});

	it('only accepts my own wishes', async () => {
		const { s, a, b } = await scene();
		const theirs = await createItem(b);
		expect(await outcome(() => actions.toggleWish(ev(a, s.id, { itemId: theirs.id, on: '1' })))).toMatchObject({
			kind: 'error',
			status: 404
		});
	});

	it('refuses wishes over budget', async () => {
		const { s, a, la } = await scene({ priceLimit: '20.00' });
		const it = await createItem(a, { price: '25.00' });
		expect(await outcome(() => actions.toggleWish(ev(a, s.id, { itemId: it.id, on: '1' })))).toEqual({
			kind: 'fail',
			status: 400,
			data: { wishError: { itemId: it.id, message: "That's over the £20 limit for this Secret Santa." } }
		});
		expect(await onList(la.id, it.id)).toBe(false);
	});

	it('adds and removes a wish from my Santa list', async () => {
		const { s, a, la } = await scene({ priceLimit: '20.00' });
		const it = await createItem(a, { price: '15.00' });
		expect(await ok(() => actions.toggleWish(ev(a, s.id, { itemId: it.id, on: '1' })))).toEqual({ toggled: it.id });
		expect(await onList(la.id, it.id)).toBe(true);
		await ok(() => actions.toggleWish(ev(a, s.id, { itemId: it.id, on: '1' })));
		expect(await onList(la.id, it.id)).toBe(true);
		await ok(() => actions.toggleWish(ev(a, s.id, { itemId: it.id })));
		expect(await onList(la.id, it.id)).toBe(false);
	});
});
