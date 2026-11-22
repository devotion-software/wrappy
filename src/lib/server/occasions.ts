import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq, inArray, isNotNull, max } from 'drizzle-orm';
import { db } from './db';
import { itemClaim, list, listExtra, listOccasion } from './db/schema';
import { newId } from './ids';

/**
 * Occasions split one list into several dates (a birthday and Christmas). Guests say which one a
 * present is for; the owner opens each one separately. See claimView.revealedToOwner.
 */
export interface Occasion {
	id: string;
	name: string;
	date: string;
	opened: boolean;
}

export const MAX_OCCASIONS = 10;

export async function listOccasions(listId: string): Promise<Occasion[]> {
	const rows = await db
		.select()
		.from(listOccasion)
		.where(eq(listOccasion.listId, listId))
		.orderBy(asc(listOccasion.occasionDate), asc(listOccasion.createdAt));
	return rows.map((o) => ({ id: o.id, name: o.name, date: o.occasionDate, opened: !!o.openedAt }));
}

/**
 * What a guest can pick from: the unopened occasions, and which to suggest (the next one coming
 * up, else the last).
 */
export function guestChoices(occasions: Occasion[], today: string): { open: Occasion[]; suggested: string | null } {
	const open = occasions.filter((o) => !o.opened);
	return { open, suggested: (open.find((o) => o.date >= today) ?? open[open.length - 1])?.id ?? null };
}

/** Of these occasion ids, the ones their owner has opened. */
export async function openedOccasions(ids: (string | null | undefined)[]): Promise<Set<string>> {
	const wanted = [...new Set(ids.filter((i): i is string => !!i))];
	if (!wanted.length) return new Set();
	const rows = await db
		.select({ id: listOccasion.id })
		.from(listOccasion)
		.where(and(inArray(listOccasion.id, wanted), isNotNull(listOccasion.openedAt)));
	return new Set(rows.map((r) => r.id));
}

/** Names for occasion ids (an item on two lists can carry another list's occasion). */
export async function occasionNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
	const wanted = [...new Set(ids.filter((i): i is string => !!i))];
	if (!wanted.length) return new Map();
	const rows = await db.select({ id: listOccasion.id, name: listOccasion.name }).from(listOccasion).where(inArray(listOccasion.id, wanted));
	return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * The occasion a guest picked when claiming on `listId`. A list with occasions needs one that
 * hasn't been opened yet (its presents are already out); a list without them takes none.
 */
export async function pickOccasion(listId: string, raw: FormDataEntryValue | null): Promise<{ occasionId: string | null } | { error: string }> {
	const occasions = await listOccasions(listId);
	if (!occasions.length) return { occasionId: null };
	const open = occasions.filter((o) => !o.opened);
	const id = String(raw ?? '');
	// Every occasion opened: the list is back to normal, revealed by "received from".
	if (!open.length && !id) return { occasionId: null };
	if (!id) {
		// Only one left to choose: no need to ask.
		if (open.length === 1) return { occasionId: open[0].id };
		return { error: 'Say which occasion it’s for.' };
	}
	const o = occasions.find((x) => x.id === id);
	if (!o) return { error: 'Pick one of the occasions.' };
	if (o.opened) return { error: `${o.name} presents have already been opened.` };
	return { occasionId: o.id };
}

/** Keep list.eventDate at the last occasion, so "has been and gone" and price alerts wait for it. */
export async function syncEventDate(listId: string) {
	const [{ last }] = await db.select({ last: max(listOccasion.occasionDate) }).from(listOccasion).where(eq(listOccasion.listId, listId));
	if (last) await db.update(list).set({ eventDate: last }).where(eq(list.id, listId));
}

export function parseOccasionForm(fd: FormData): { name: string; date: string } | { error: string } {
	const name = String(fd.get('name') ?? '').trim();
	const date = String(fd.get('date') ?? '').trim();
	if (!name) return { error: 'Name the occasion, like Birthday.' };
	if (name.length > 80) return { error: 'Keep the name under 80 characters.' };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return { error: 'Pick a date for it.' };
	return { name, date };
}

async function ownerListFor(event: RequestEvent) {
	const me = event.locals.user;
	if (!me) error(401, 'Log in first');
	const listId = (event.params as { id: string }).id;
	const [l] = await db
		.select()
		.from(list)
		.where(and(eq(list.id, listId), eq(list.ownerId, me.id)))
		.limit(1);
	if (!l) error(404, 'List not found');
	return l;
}

async function ownedOccasion(listId: string, id: string) {
	const [o] = await db
		.select()
		.from(listOccasion)
		.where(and(eq(listOccasion.id, id), eq(listOccasion.listId, listId)))
		.limit(1);
	if (!o) error(404, 'Occasion not found');
	return o;
}

/** Owner-only form actions on the list page. */
export const occasionActions = {
	addOccasion: async (event: RequestEvent) => {
		const l = await ownerListFor(event);
		if (l.santaId) return fail(400, { occasionError: 'Secret Santa lists have one date: the exchange.' });
		const parsed = parseOccasionForm(await event.request.formData());
		if ('error' in parsed) return fail(400, { occasionError: parsed.error });
		const existing = await listOccasions(l.id);
		if (existing.length >= MAX_OCCASIONS) return fail(400, { occasionError: `A list can have up to ${MAX_OCCASIONS} occasions.` });
		if (existing.some((o) => o.name.toLowerCase() === parsed.name.toLowerCase())) {
			return fail(400, { occasionError: `This list already has ${parsed.name}.` });
		}
		await db.insert(listOccasion).values({ id: newId(), listId: l.id, name: parsed.name, occasionDate: parsed.date });
		await syncEventDate(l.id);
		return { occasionAdded: true };
	},

	/**
	 * Rename an occasion or move its date. Presents stay with it, and nothing about claims changes,
	 * so this is safe even after it's been opened.
	 */
	updateOccasion: async (event: RequestEvent) => {
		const l = await ownerListFor(event);
		const fd = await event.request.formData();
		const o = await ownedOccasion(l.id, String(fd.get('occasionId') ?? ''));
		const parsed = parseOccasionForm(fd);
		if ('error' in parsed) return fail(400, { occasionError: parsed.error, occasionEditing: o.id });
		const others = (await listOccasions(l.id)).filter((x) => x.id !== o.id);
		if (others.some((x) => x.name.toLowerCase() === parsed.name.toLowerCase())) {
			return fail(400, { occasionError: `This list already has ${parsed.name}.`, occasionEditing: o.id });
		}
		await db.update(listOccasion).set({ name: parsed.name, occasionDate: parsed.date }).where(eq(listOccasion.id, o.id));
		await syncEventDate(l.id);
		return { occasionUpdated: o.id };
	},

	/**
	 * Remove an occasion that hasn't been opened. Its presents move to the nearest other unopened
	 * occasion (guests can change that), so removing one never reveals anything. The last unopened
	 * occasion can't be removed for the same reason.
	 */
	removeOccasion: async (event: RequestEvent) => {
		const l = await ownerListFor(event);
		const o = await ownedOccasion(l.id, String((await event.request.formData()).get('occasionId') ?? ''));
		if (o.openedAt) return fail(400, { occasionError: `You've opened ${o.name} presents, so it stays.` });
		const others = (await listOccasions(l.id)).filter((x) => x.id !== o.id && !x.opened);
		if (!others.length) return fail(400, { occasionError: 'Add another occasion before removing this one.' });
		const to = others.find((x) => x.date >= o.occasionDate) ?? others[others.length - 1];
		await db.transaction(async (tx) => {
			await tx.update(itemClaim).set({ occasionId: to.id }).where(eq(itemClaim.occasionId, o.id));
			await tx.update(listExtra).set({ occasionId: to.id }).where(eq(listExtra.occasionId, o.id));
			await tx.delete(listOccasion).where(eq(listOccasion.id, o.id));
		});
		await syncEventDate(l.id);
		return { occasionRemoved: true };
	},

	openOccasion: async (event: RequestEvent) => {
		const l = await ownerListFor(event);
		const o = await ownedOccasion(l.id, String((await event.request.formData()).get('occasionId') ?? ''));
		await openOccasion(l.ownerId, o.id);
		return { occasionOpened: o.id };
	}
};

/**
 * Mark an occasion's presents opened: what was bought for it shows. One way, like "received from":
 * unopening would let the owner peek and hide it again.
 */
export async function openOccasion(ownerId: string, occasionId: string) {
	const [o] = await db
		.select({ id: listOccasion.id, openedAt: listOccasion.openedAt })
		.from(listOccasion)
		.innerJoin(list, eq(list.id, listOccasion.listId))
		.where(and(eq(listOccasion.id, occasionId), eq(list.ownerId, ownerId)))
		.limit(1);
	if (!o) error(404, 'Occasion not found');
	if (!o.openedAt) await db.update(listOccasion).set({ openedAt: new Date() }).where(eq(listOccasion.id, o.id));
}

/** Every occasion on the owner's lists (archived ones included), soonest first, for Presents received. */
export async function ownerOccasions(ownerId: string): Promise<(Occasion & { listId: string; listTitle: string })[]> {
	const rows = await db
		.select({ o: listOccasion, listTitle: list.title })
		.from(listOccasion)
		.innerJoin(list, eq(list.id, listOccasion.listId))
		.where(eq(list.ownerId, ownerId))
		.orderBy(asc(listOccasion.occasionDate), asc(list.title));
	return rows.map(({ o, listTitle }) => ({
		id: o.id,
		name: o.name,
		date: o.occasionDate,
		opened: !!o.openedAt,
		listId: o.listId,
		listTitle
	}));
}
