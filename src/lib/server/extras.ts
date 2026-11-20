import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import { listExtra, user } from './db/schema';
import { getListAccess, usersWhoCanSee, type ListRow } from './access';
import { newId } from './ids';
import { pickOccasion } from './occasions';

/**
 * Presents guests have bought that aren't on the list ("I got her the matching gloves"), so
 * nobody else buys the same thing. The owner never gets these on the list page; they turn up in
 * Presents received once revealed, like a Bought claim (see gifts.allReceived).
 */
export interface ExtraView {
	id: string;
	title: string;
	/** Whoever added it, when they can still see this list (as for claims). */
	byName: string | null;
	mine: boolean;
	occasionId: string | null;
}

export const MAX_EXTRAS_PER_PERSON = 20;

/** Extras on a list for a signed-in guest. Owners and signed-out visitors get none. */
export async function loadExtras(l: ListRow, viewerId: string | null): Promise<ExtraView[]> {
	if (!viewerId || viewerId === l.ownerId || l.santaId) return [];
	const rows = await db
		.select({ id: listExtra.id, title: listExtra.title, userId: listExtra.userId, name: user.name, occasionId: listExtra.occasionId })
		.from(listExtra)
		.innerJoin(user, eq(user.id, listExtra.userId))
		.where(eq(listExtra.listId, l.id))
		.orderBy(asc(listExtra.createdAt));
	if (!rows.length) return [];
	const canSee = await usersWhoCanSee(l, rows.map((r) => r.userId));
	return rows.map((r) => ({
		id: r.id,
		title: r.title,
		byName: canSee.has(r.userId) ? r.name : null,
		mine: r.userId === viewerId,
		occasionId: r.occasionId
	}));
}

const extraFail = (message: string) => fail(400, { extraError: message });

async function guestList(event: RequestEvent) {
	const listId = (event.params as { id: string }).id;
	const me = event.locals.user;
	if (!me) redirect(303, `/signin?next=${encodeURIComponent(`/lists/${listId}`)}`);
	const access = await getListAccess(listId, { id: me.id, email: me.email }, event.cookies);
	if (!access) error(404, 'List not found');
	if (access.isOwner) error(403, 'Only guests can add presents that are off the list.');
	if (access.list.santaId) error(400, 'Secret Santa lists only have the items on them.');
	return { me, l: access.list };
}

export const extraActions = {
	addExtra: async (event: RequestEvent) => {
		const { me, l } = await guestList(event);
		const fd = await event.request.formData();
		const title = String(fd.get('title') ?? '').trim();
		if (!title) return extraFail('Say what you got.');
		if (title.length > 200) return extraFail('Keep it under 200 characters.');
		const occ = await pickOccasion(l.id, fd.get('occasionId'));
		if ('error' in occ) return extraFail(occ.error);
		const mine = await db
			.select({ id: listExtra.id })
			.from(listExtra)
			.where(and(eq(listExtra.listId, l.id), eq(listExtra.userId, me.id)));
		if (mine.length >= MAX_EXTRAS_PER_PERSON) return extraFail(`You can add up to ${MAX_EXTRAS_PER_PERSON} of these to a list.`);
		await db.insert(listExtra).values({ id: newId(), listId: l.id, userId: me.id, title, occasionId: occ.occasionId });
		return { extraAdded: true };
	},

	removeExtra: async (event: RequestEvent) => {
		const { me, l } = await guestList(event);
		const id = String((await event.request.formData()).get('extraId') ?? '');
		await db.delete(listExtra).where(and(eq(listExtra.id, id), eq(listExtra.listId, l.id), eq(listExtra.userId, me.id)));
		return { extraRemoved: true };
	}
};
