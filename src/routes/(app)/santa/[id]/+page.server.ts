import { error, fail, redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { item, itemList, list, santa, santaExclusion, user } from '#lib/server/db/schema';
import { exclusionsOf, getSanta, joinSanta, leaveSanta, membersOf, runDraw, type SantaRow } from '#lib/server/santa';
import { parseSantaForm } from '#lib/server/santaForm';
import { addItemToList } from '#lib/server/lists';
import { santaPriceProblem } from '#lib/server/items';
import { formatPrice } from '#lib/format';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

async function context(event: RequestEvent | Parameters<PageServerLoad>[0]) {
	const me = event.locals.user!;
	const s = await getSanta(event.params.id);
	if (!s) error(404, 'Secret Santa not found');
	const members = await membersOf(s.id);
	const mine = members.find((m) => m.userId === me.id) ?? null;
	const isOrganiser = s.ownerId === me.id;
	// Non-members can't see an exchange (they join via the link instead).
	if (!mine && !isOrganiser) error(404, 'Secret Santa not found');
	return { me, s, members, mine, isOrganiser };
}

export const load: PageServerLoad = async (event) => {
	const { me, s, members, mine, isOrganiser } = await context(event);
	const [organiser] = await db.select({ name: user.name }).from(user).where(eq(user.id, s.ownerId));

	// My Santa wish list + my other wishes that fit the budget.
	let wishes: { id: string; title: string; price: string | null; currency: string; onList: boolean; fits: boolean }[] = [];
	if (mine?.listId) {
		const [onList, all] = await Promise.all([
			db.select({ itemId: itemList.itemId }).from(itemList).where(eq(itemList.listId, mine.listId)),
			db.select().from(item).where(eq(item.ownerId, me.id)).orderBy(asc(item.title))
		]);
		const on = new Set(onList.map((r) => r.itemId));
		wishes = all.map((it) => ({
			id: it.id,
			title: it.title,
			price: it.price,
			currency: it.currency,
			onList: on.has(it.id),
			fits:
				s.priceLimit === null ||
				(it.price !== null && it.currency === s.currency && Number(it.price) <= Number(s.priceLimit))
		}));
	}

	const recipient = mine?.assignedToId ? members.find((m) => m.userId === mine.assignedToId) : null;
	const byId = new Map(members.map((m) => [m.userId, m.name]));

	return {
		santa: {
			id: s.id,
			name: s.name,
			description: s.description,
			budget: formatPrice(s.priceLimit, s.currency),
			priceLimit: s.priceLimit,
			currency: s.currency,
			exchangeDate: s.exchangeDate,
			status: s.status,
			drawnAt: s.drawnAt
		},
		organiserName: organiser?.name ?? '',
		isOrganiser,
		// Assignments are private: never send other members' matches to the browser.
		members: members.map((m) => ({ id: m.userId, name: m.name })),
		me: mine ? { listId: mine.listId } : null,
		recipient: recipient ? { name: recipient.name, listId: recipient.listId } : null,
		wishes,
		organiser: isOrganiser
			? {
					joinToken: s.joinToken,
					exclusions: (await exclusionsOf(s.id)).map((e) => ({
						a: e.userA,
						b: e.userB,
						aName: byId.get(e.userA) ?? '?',
						bName: byId.get(e.userB) ?? '?'
					}))
				}
			: null
	};
};

function requireOrganiser(isOrganiser: boolean) {
	if (!isOrganiser) error(403, 'Only the organiser can do that.');
}
function requireOpen(s: SantaRow) {
	if (s.status !== 'open') error(400, 'Names have already been drawn.');
}

export const actions: Actions = {
	// ── Organiser ─────────────────────────────────────────────────────────────
	update: async (event) => {
		const { s, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		const parsed = parseSantaForm(await event.request.formData());
		if ('error' in parsed) return fail(400, { settingsError: parsed.error });
		// Budget and currency are locked once names are drawn, since wishes were chosen against them.
		const input = s.status === 'open' ? parsed.input : { ...parsed.input, priceLimit: s.priceLimit, currency: s.currency };
		await db.update(santa).set(input).where(eq(santa.id, s.id));
		return { saved: true };
	},

	addExclusion: async (event) => {
		const { s, members, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		requireOpen(s);
		const fd = await event.request.formData();
		const a = String(fd.get('a') ?? '');
		const b = String(fd.get('b') ?? '');
		const ids = new Set(members.map((m) => m.userId));
		if (!ids.has(a) || !ids.has(b) || a === b) return fail(400, { exclusionError: 'Pick two different people.' });
		const [x, y] = [a, b].sort();
		await db.insert(santaExclusion).values({ santaId: s.id, userA: x, userB: y }).onDuplicateKeyUpdate({ set: { userA: x } });
		return { excluded: true };
	},

	removeExclusion: async (event) => {
		const { s, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		requireOpen(s);
		const fd = await event.request.formData();
		await db
			.delete(santaExclusion)
			.where(
				and(
					eq(santaExclusion.santaId, s.id),
					eq(santaExclusion.userA, String(fd.get('a') ?? '')),
					eq(santaExclusion.userB, String(fd.get('b') ?? ''))
				)
			);
		return { excluded: true };
	},

	removeMember: async (event) => {
		const { s, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		const userId = String((await event.request.formData()).get('userId') ?? '');
		await leaveSanta(s, userId);
		return { removed: true };
	},

	draw: async (event) => {
		const { s, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		const problem = await runDraw(s, event.url.origin);
		if (problem) return fail(400, { drawError: problem });
		return { drawn: true };
	},

	deleteSanta: async (event) => {
		const { s, members, isOrganiser } = await context(event);
		requireOrganiser(isOrganiser);
		// Members' Santa lists hold references to their own items; deleting the lists keeps the items.
		await db.transaction(async (tx) => {
			for (const m of members) if (m.listId) await tx.delete(itemList).where(eq(itemList.listId, m.listId));
		});
		await db.delete(list).where(eq(list.santaId, s.id));
		await db.delete(santa).where(eq(santa.id, s.id));
		redirect(303, '/santa');
	},

	// ── Members ───────────────────────────────────────────────────────────────
	join: async (event) => {
		const { me, s } = await context(event);
		await joinSanta(s, me.id);
		return { joined: true };
	},

	leave: async (event) => {
		const { me, s } = await context(event);
		await leaveSanta(s, me.id);
		redirect(303, '/santa');
	},

	toggleWish: async (event) => {
		const { me, mine } = await context(event);
		if (!mine?.listId) error(400, "You're not taking part in this one.");
		const fd = await event.request.formData();
		const itemId = String(fd.get('itemId') ?? '');
		const [it] = await db
			.select()
			.from(item)
			.where(and(eq(item.id, itemId), eq(item.ownerId, me.id)))
			.limit(1);
		if (!it) error(404, 'Wish not found');
		if (fd.get('on') === '1') {
			const problem = await santaPriceProblem(mine.listId, it);
			if (problem) return fail(400, { wishError: { itemId, message: problem } });
			await addItemToList(mine.listId, it.id);
		} else {
			await db.delete(itemList).where(and(eq(itemList.listId, mine.listId), eq(itemList.itemId, it.id)));
		}
		return { toggled: itemId };
	}
};
