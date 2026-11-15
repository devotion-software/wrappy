import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { listViewer } from './db/schema';
import { getListAccess, linkCookieName, rememberLinkToken, santaGiftClaims, usersWhoCanSee } from './access';
import {
	addSantaMember,
	addToList,
	createItem,
	createList,
	createSanta,
	createUser,
	setDrawn,
	share,
	view
} from '../../../tests/helpers/fixtures';
import { fakeCookies } from '../../../tests/helpers/event';
import { newToken } from './ids';

const asViewer = (u: { id: string; email: string }) => ({ id: u.id, email: u.email });

async function viewerRow(listId: string, userId: string) {
	const [row] = await db
		.select()
		.from(listViewer)
		.where(and(eq(listViewer.listId, listId), eq(listViewer.userId, userId)));
	return row ?? null;
}

describe('getListAccess', () => {
	it('returns null for a list that does not exist', async () => {
		expect(await getListAccess('nope', null, fakeCookies())).toBeNull();
	});

	it('lets the owner in as owner without recording a view', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const access = await getListAccess(l.id, asViewer(owner), fakeCookies());
		expect(access).toMatchObject({ isOwner: true, list: { id: l.id } });
		expect(await viewerRow(l.id, owner.id)).toBeNull();
	});

	it('shows public lists to anyone, including signed-out visitors', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		expect(await getListAccess(l.id, null, fakeCookies())).toMatchObject({ isOwner: false });
		const guest = await createUser();
		expect(await getListAccess(l.id, asViewer(guest), fakeCookies())).toMatchObject({ isOwner: false });
	});

	it('hides private lists from strangers and signed-out visitors', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const stranger = await createUser();
		expect(await getListAccess(l.id, null, fakeCookies())).toBeNull();
		expect(await getListAccess(l.id, asViewer(stranger), fakeCookies())).toBeNull();
		expect(await viewerRow(l.id, stranger.id)).toBeNull();
	});

	it('lets in people invited by email, before and after the invite is linked to their account', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const byEmail = await createUser();
		await share(l, { email: byEmail.email.toUpperCase() });
		// Viewer email is compared case-insensitively.
		expect(await getListAccess(l.id, { id: byEmail.id, email: byEmail.email.toUpperCase() }, fakeCookies())).not.toBeNull();

		const byId = await createUser();
		await share(l, { email: 'old-address@example.test', id: byId.id });
		expect(await getListAccess(l.id, asViewer(byId), fakeCookies())).not.toBeNull();
	});

	it('grants access through a matching secret-link cookie, even when signed out', async () => {
		const owner = await createUser();
		const token = newToken();
		const l = await createList(owner, { shareToken: token });
		expect(await getListAccess(l.id, null, fakeCookies({ [linkCookieName(l.id)]: token }))).not.toBeNull();
		expect(await getListAccess(l.id, null, fakeCookies({ [linkCookieName(l.id)]: 'wrong' }))).toBeNull();
	});

	it('remembers a signed-in visitor who came through the link, until the link is turned off', async () => {
		const owner = await createUser();
		const token = newToken();
		const l = await createList(owner, { shareToken: token });
		const guest = await createUser();

		await getListAccess(l.id, asViewer(guest), fakeCookies({ [linkCookieName(l.id)]: token }));
		expect(await viewerRow(l.id, guest.id)).toMatchObject({ viaLink: true });
		// Later visit without the cookie still works.
		expect(await getListAccess(l.id, asViewer(guest), fakeCookies())).not.toBeNull();

		// Turning the link off (token null) revokes standing link access.
		const { list } = await import('./db/schema');
		await db.update(list).set({ shareToken: null }).where(eq(list.id, l.id));
		expect(await getListAccess(l.id, asViewer(guest), fakeCookies())).toBeNull();
	});

	it('does not downgrade viaLink on a later visit without the cookie', async () => {
		const owner = await createUser();
		const token = newToken();
		const l = await createList(owner, { shareToken: token, visibility: 'public' });
		const guest = await createUser();
		await getListAccess(l.id, asViewer(guest), fakeCookies({ [linkCookieName(l.id)]: token }));
		await getListAccess(l.id, asViewer(guest), fakeCookies());
		expect(await viewerRow(l.id, guest.id)).toMatchObject({ viaLink: true });
	});

	it('records signed-in guests on public lists as non-link viewers', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const guest = await createUser();
		await getListAccess(l.id, asViewer(guest), fakeCookies());
		expect(await viewerRow(l.id, guest.id)).toMatchObject({ viaLink: false });
	});

	it('a viaLink viewer row without a link token does not grant access', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const guest = await createUser();
		await view(l, guest, true);
		expect(await getListAccess(l.id, asViewer(guest), fakeCookies())).toBeNull();
	});

	describe('Secret Santa lists', () => {
		async function exchange() {
			const [org, a, b, c] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
			const s = await createSanta(org);
			const la = await addSantaMember(s, a);
			await addSantaMember(s, b);
			await addSantaMember(s, c);
			return { s, org, a, b, c, la };
		}

		it('are hidden from everyone but the owner before the draw', async () => {
			const { a, b, org, la } = await exchange();
			expect(await getListAccess(la.id, asViewer(a), fakeCookies())).toMatchObject({ isOwner: true });
			expect(await getListAccess(la.id, asViewer(b), fakeCookies())).toBeNull();
			expect(await getListAccess(la.id, asViewer(org), fakeCookies())).toBeNull();
		});

		it('are visible only to the assigned Santa after the draw', async () => {
			const { s, a, b, c, la } = await exchange();
			await setDrawn(s, [
				[b, a],
				[a, c],
				[c, b]
			]);
			expect(await getListAccess(la.id, asViewer(b), fakeCookies())).toMatchObject({ isOwner: false });
			expect(await getListAccess(la.id, asViewer(c), fakeCookies())).toBeNull();
		});

		it('ignore public visibility, email shares and link cookies', async () => {
			const { a, b, la } = await exchange();
			const token = newToken();
			const { list } = await import('./db/schema');
			await db.update(list).set({ visibility: 'public', shareToken: token }).where(eq(list.id, la.id));
			await share(la, b);
			expect(await getListAccess(la.id, null, fakeCookies({ [linkCookieName(la.id)]: token }))).toBeNull();
			expect(await getListAccess(la.id, asViewer(b), fakeCookies({ [linkCookieName(la.id)]: token }))).toBeNull();
			expect(await getListAccess(la.id, asViewer(a), fakeCookies())).toMatchObject({ isOwner: true });
		});
	});
});

describe('rememberLinkToken', () => {
	it('sets a long-lived, http-only, per-list cookie', () => {
		const cookies = fakeCookies();
		rememberLinkToken(cookies, 'L1', 'tok');
		expect(cookies.jar.get('wl_L1')).toEqual({
			value: 'tok',
			opts: { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 }
		});
	});
});

describe('usersWhoCanSee', () => {
	it('returns an empty set for no users', async () => {
		const owner = await createUser();
		expect(await usersWhoCanSee(await createList(owner), [])).toEqual(new Set());
	});

	it('includes everyone for a public list', async () => {
		const owner = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		expect(await usersWhoCanSee(l, ['x', 'y', 'x'])).toEqual(new Set(['x', 'y']));
	});

	it('includes the owner, linked invitees and link viewers of a private list', async () => {
		const owner = await createUser();
		const [invited, linkGuest, stranger, pendingInvite] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
		const l = await createList(owner, { shareToken: newToken() });
		await share(l, invited);
		// An invite not yet linked to an account (userId null) doesn't count here.
		await share(l, { email: pendingInvite.email });
		await view(l, linkGuest, true);
		await view(l, stranger, false);
		expect(await usersWhoCanSee(l, [owner.id, invited.id, linkGuest.id, stranger.id, pendingInvite.id])).toEqual(
			new Set([owner.id, invited.id, linkGuest.id])
		);
	});

	it('ignores link viewers once the link is off', async () => {
		const owner = await createUser();
		const guest = await createUser();
		const l = await createList(owner);
		await view(l, guest, true);
		expect(await usersWhoCanSee(l, [guest.id])).toEqual(new Set());
	});

	it('for a Santa list, includes only the owner and their assigned Santa after the draw', async () => {
		const [org, a, b, c] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
		const s = await createSanta(org);
		const la = await addSantaMember(s, a);
		await addSantaMember(s, b);
		await addSantaMember(s, c);
		expect(await usersWhoCanSee(la, [a.id, b.id, c.id])).toEqual(new Set([a.id]));
		await setDrawn(s, [
			[b, a],
			[a, c],
			[c, b]
		]);
		expect(await usersWhoCanSee(la, [a.id, b.id, c.id, org.id])).toEqual(new Set([a.id, b.id]));
	});
});

describe('santaGiftClaims', () => {
	it('flags claims by the owner’s Santa on items from their Santa list', async () => {
		const [org, a, b, c, friend] = await Promise.all([createUser(), createUser(), createUser(), createUser(), createUser()]);
		const s = await createSanta(org);
		const la = await addSantaMember(s, a);
		await addSantaMember(s, b);
		await addSantaMember(s, c);
		const onSantaList = await createItem(a, {}, { lists: [la] });
		const elsewhere = await createItem(a);
		const normal = await createList(a);
		await addToList(normal, onSantaList);
		await addToList(normal, elsewhere);

		const claims = [
			{ itemId: onSantaList.id, userId: b.id },
			{ itemId: elsewhere.id, userId: b.id },
			{ itemId: onSantaList.id, userId: friend.id }
		];
		// Before the draw nothing is a Santa gift.
		expect(await santaGiftClaims(a.id, claims)).toEqual(new Set());

		await setDrawn(s, [
			[b, a],
			[a, c],
			[c, b]
		]);
		expect(await santaGiftClaims(a.id, claims)).toEqual(new Set([`${onSantaList.id}:${b.id}`]));
		expect(await santaGiftClaims(a.id, [])).toEqual(new Set());
	});
});
