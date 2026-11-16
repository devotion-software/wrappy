import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

vi.mock('#lib/server/email', () => ({
	sendListReminderEmail: vi.fn(async () => {}),
	sendBuyingReminderEmail: vi.fn(async () => {}),
	sendSantaReminderEmail: vi.fn(async () => {})
}));

import { db } from './db';
import { itemClaim } from './db/schema';
import { daysBetween, runReminders } from './reminders';
import { readUnsubscribeToken, setEmailPrefs, unsubscribeToken } from './emailPrefs';
import { sendBuyingReminderEmail, sendListReminderEmail, sendSantaReminderEmail } from '#lib/server/email';
import {
	addSantaMember,
	claim,
	createItem,
	createList,
	createSanta,
	createUser,
	setDrawn,
	share,
	view
} from '../../../tests/helpers/fixtures';

const BASE = 'https://wish.test';
const DAY = 24 * 60 * 60 * 1000;
const listMail = vi.mocked(sendListReminderEmail);
const buyingMail = vi.mocked(sendBuyingReminderEmail);
const santaMail = vi.mocked(sendSantaReminderEmail);

// Far enough ahead that other tests' fixtures don't fall in the reminder windows.
const NOW = new Date('2033-06-01T09:00:00Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * DAY).toISOString().slice(0, 10);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sentTo = (mock: { mock: { calls: any[][] } }, email: string): any[] =>
	mock.mock.calls.map(([a]) => a).filter((a) => a.email === email);

beforeEach(() => {
	listMail.mockClear();
	buyingMail.mockClear();
	santaMail.mockClear();
});

describe('daysBetween', () => {
	it('counts whole days between ISO dates', () => {
		expect(daysBetween('2033-06-01', '2033-06-15')).toBe(14);
		expect(daysBetween('2033-06-01', '2033-06-01')).toBe(0);
	});
});

describe('list reminders', () => {
	async function scene(eventInDays: number) {
		const owner = await createUser({ name: 'Meg' });
		const viewer = await createUser();
		const claimer = await createUser();
		const invited = await createUser();
		const quiet = await createUser();
		const l = await createList(owner, { title: 'Birthday', visibility: 'private', eventDate: inDays(eventInDays), shareToken: 'tok' + Date.now() });
		await view(l, viewer, true);
		await view(l, claimer, true);
		await view(l, quiet, true);
		await share(l, invited);
		const a = await createItem(owner, { title: 'Scarf' }, { lists: [l] });
		await createItem(owner, { title: 'Hat' }, { lists: [l] });
		await createItem(owner, { title: 'Socks' }, { lists: [l] });
		await claim(a, claimer, 'buying');
		await setEmailPrefs(quiet.id, { list: false });
		return { owner, viewer, claimer, invited, quiet, l };
	}

	it('emails people who can see the list, not the owner, claimers or anyone who opted out', async () => {
		const s = await scene(10);
		await runReminders(BASE, NOW);
		expect(sentTo(listMail, s.viewer.email)).toEqual([
			expect.objectContaining({
				ownerName: 'Meg',
				listTitle: 'Birthday',
				daysLeft: 10,
				unclaimed: 2,
				url: `${BASE}/lists/${s.l.id}`,
				unsubscribeUrl: `${BASE}/unsubscribe/${unsubscribeToken(s.viewer.id, 'list')}`
			})
		]);
		expect(sentTo(listMail, s.invited.email)).toHaveLength(1);
		for (const u of [s.owner, s.claimer, s.quiet]) expect(sentTo(listMail, u.email)).toEqual([]);
	});

	it('counts an item wanted more than once as open until every one is claimed', async () => {
		const s = await scene(10);
		const candles = await createItem(s.owner, { title: 'Candles', quantity: 2 }, { lists: [s.l] });
		await claim(candles, s.claimer, 'buying');
		const any = await createItem(s.owner, { title: 'Books', quantity: null }, { lists: [s.l] });
		await claim(any, s.claimer, 'buying');
		const bike = await createItem(s.owner, { title: 'Bike', price: '80.00', groupGift: true }, { lists: [s.l] });
		await db.insert(itemClaim).values({ itemId: bike.id, userId: s.claimer.id, status: 'buying', amount: '20.00' });
		await runReminders(BASE, NOW);
		expect(sentTo(listMail, s.viewer.email)[0]).toMatchObject({ unclaimed: 5 });
	});

	it('sends each window once, then the final one closer to the date', async () => {
		const s = await scene(10);
		await runReminders(BASE, NOW);
		await runReminders(BASE, NOW);
		expect(sentTo(listMail, s.viewer.email)).toHaveLength(1);
		await runReminders(BASE, new Date(NOW.getTime() + 8 * DAY));
		expect(sentTo(listMail, s.viewer.email).map((a) => a.daysLeft)).toEqual([10, 2]);
	});

	it('stays quiet when the date is far off, has passed, or everything is claimed', async () => {
		const far = await scene(30);
		const past = await scene(-1);
		await runReminders(BASE, NOW);
		expect(sentTo(listMail, far.viewer.email)).toEqual([]);
		expect(sentTo(listMail, past.viewer.email)).toEqual([]);
	});

	it('skips people who can no longer see the list', async () => {
		const owner = await createUser();
		const was = await createUser();
		// Opened it while public (not via link), then it went private.
		const l = await createList(owner, { visibility: 'private', eventDate: inDays(5) });
		await view(l, was, false);
		await createItem(owner, {}, { lists: [l] });
		await runReminders(BASE, NOW);
		expect(sentTo(listMail, was.email)).toEqual([]);
	});
});

describe('buying reminders', () => {
	it('nudges a claimer two weeks after "I’ll get it", once', async () => {
		const owner = await createUser({ name: 'Meg' });
		const buyer = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const stale = await createItem(owner, { title: 'Scarf' }, { lists: [l] });
		const fresh = await createItem(owner, { title: 'Hat' }, { lists: [l] });
		const done = await createItem(owner, { title: 'Socks' }, { lists: [l] });
		await claim(stale, buyer, 'buying');
		await claim(fresh, buyer, 'buying');
		await claim(done, buyer, 'bought');
		await db.update(itemClaim).set({ updatedAt: new Date(NOW.getTime() - 20 * DAY) }).where(eq(itemClaim.itemId, stale.id));
		await db.update(itemClaim).set({ updatedAt: new Date(NOW.getTime() - 3 * DAY) }).where(eq(itemClaim.itemId, fresh.id));
		await db.update(itemClaim).set({ updatedAt: new Date(NOW.getTime() - 30 * DAY) }).where(eq(itemClaim.itemId, done.id));

		await runReminders(BASE, NOW);
		await runReminders(BASE, NOW);
		expect(sentTo(buyingMail, buyer.email)).toEqual([
			expect.objectContaining({ itemTitle: 'Scarf', ownerName: 'Meg', weeks: 2, url: `${BASE}/lists/${l.id}/items/${stale.id}` })
		]);
		expect(sentTo(buyingMail, owner.email)).toEqual([]);
	});

	it('respects the opt-out', async () => {
		const owner = await createUser();
		const buyer = await createUser();
		const l = await createList(owner, { visibility: 'public' });
		const it = await createItem(owner, {}, { lists: [l] });
		await claim(it, buyer, 'buying');
		await db.update(itemClaim).set({ updatedAt: new Date(NOW.getTime() - 20 * DAY) }).where(eq(itemClaim.itemId, it.id));
		await setEmailPrefs(buyer.id, { buying: false });
		await runReminders(BASE, NOW);
		expect(sentTo(buyingMail, buyer.email)).toEqual([]);
	});
});

describe('santa reminders', () => {
	it('reminds each giver who they’re buying for a week before the swap', async () => {
		const org = await createUser();
		const [a, b, c] = [await createUser({ name: 'Ann' }), await createUser({ name: 'Bob' }), await createUser({ name: 'Cat' })];
		const s = await createSanta(org, { name: 'Office', exchangeDate: inDays(6), priceLimit: '20.00' });
		for (const u of [a, b, c]) await addSantaMember(s, u);
		await setDrawn(s, [
			[a, b],
			[b, c],
			[c, a]
		]);
		const notYet = await createSanta(org, { exchangeDate: inDays(20) });
		await addSantaMember(notYet, a);
		await setDrawn(notYet, []);

		await runReminders(BASE, NOW);
		await runReminders(BASE, NOW);
		expect(sentTo(santaMail, a.email)).toEqual([
			expect.objectContaining({ santaName: 'Office', recipientName: 'Bob', daysLeft: 6, budget: '£20', url: `${BASE}/santa/${s.id}` })
		]);
		expect(sentTo(santaMail, c.email)[0]).toMatchObject({ recipientName: 'Ann' });
		expect(sentTo(santaMail, org.email)).toEqual([]);
	});
});

describe('unsubscribe tokens', () => {
	it('round-trips and rejects tampering', () => {
		const t = unsubscribeToken('user123', 'santa');
		expect(readUnsubscribeToken(t)).toEqual({ userId: 'user123', kind: 'santa' });
		expect(readUnsubscribeToken(t.replace('user123', 'user124'))).toBeNull();
		expect(readUnsubscribeToken(t.replace('.santa.', '.list.'))).toBeNull();
		expect(readUnsubscribeToken('nonsense')).toBeNull();
		expect(readUnsubscribeToken('a.b.c')).toBeNull();
	});
});
