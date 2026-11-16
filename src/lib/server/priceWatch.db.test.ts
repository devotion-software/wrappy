import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { itemLink, priceHistory } from './db/schema';
import { setEmailPrefs } from './emailPrefs';
import { addLink, claim, createItem, createList, createUser, share, uniq, view } from '../../../tests/helpers/fixtures';

const sent = vi.hoisted(() => [] as any[]);
vi.mock('./email', () => ({ sendPriceDropEmail: async (opts: unknown) => void sent.push(opts) }));
vi.mock('./linkFetch', async (importActual) => ({ ...(await importActual<typeof import('./linkFetch')>()), fetchLinkMeta: vi.fn() }));

const { runPriceChecks, isDrop } = await import('./priceWatch');
const { fetchLinkMeta } = await import('./linkFetch');
const mockMeta = vi.mocked(fetchLinkMeta);

const BASE = 'https://wrappy.test';
const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date();
const later = (days: number) => new Date(T0.getTime() + days * DAY);
// A high limit so links left by other test files can't crowd ours out of a run.
const run = (at: Date) => runPriceChecks(BASE, at, 10_000);
const priceIs = (price: string | null, currency = 'GBP') =>
	mockMeta.mockImplementation(async () => ({ title: 'x', description: null, price, currency: price ? currency : null, images: [] }));
const linkRow = async (id: string) => (await db.select().from(itemLink).where(eq(itemLink.id, id)))[0];
const mailsFor = (email: string) => sent.filter((s) => s.email === email);

beforeEach(() => {
	sent.length = 0;
	mockMeta.mockReset();
});

/** Owner's public list with a linked item; a viewer, an invitee and someone who opted out. */
async function scene(over: { eventDate?: string | null; quantity?: number | null } = {}) {
	const owner = await createUser({ name: 'Meg' });
	const [viewer, invited, quiet] = [await createUser(), await createUser(), await createUser()];
	const l = await createList(owner, { visibility: 'public', eventDate: over.eventDate ?? null });
	const it = await createItem(owner, { title: 'Lamp', quantity: over.quantity === undefined ? 1 : over.quantity }, { lists: [l] });
	const linkId = await addLink(it, `https://shop-${uniq()}.example.com/lamp`);
	await view(l, viewer);
	await share(l, invited);
	await view(l, quiet);
	await setEmailPrefs(quiet.id, { price: false });
	return { owner, viewer, invited, quiet, l, it, linkId };
}

describe('isDrop', () => {
	it('needs the same currency and at least a 5% fall', () => {
		expect(isDrop({ price: '100.00', currency: 'GBP' }, { price: '95.00', currency: 'GBP' })).toBe(true);
		expect(isDrop({ price: '100.00', currency: 'GBP' }, { price: '96.00', currency: 'GBP' })).toBe(false);
		expect(isDrop({ price: '100.00', currency: 'GBP' }, { price: '120.00', currency: 'GBP' })).toBe(false);
		expect(isDrop({ price: '100.00', currency: 'EUR' }, { price: '50.00', currency: 'GBP' })).toBe(false);
		expect(isDrop({ price: null, currency: null }, { price: '50.00', currency: 'GBP' })).toBe(false);
	});
});

describe('runPriceChecks', () => {
	it('takes a first reading quietly, then emails people who could get it when the price drops', async () => {
		const s = await scene();
		priceIs('40.00');
		await run(T0);
		expect(await linkRow(s.linkId)).toMatchObject({ lastPrice: '40.00', lastCurrency: 'GBP' });
		expect(sent).toEqual([]);

		// Not due again within a day.
		priceIs('30.00');
		await run(later(0.5));
		expect((await linkRow(s.linkId)).lastPrice).toBe('40.00');

		await run(later(2));
		expect((await linkRow(s.linkId)).lastPrice).toBe('30.00');
		expect(mailsFor(s.viewer.email)).toEqual([
			expect.objectContaining({ ownerName: 'Meg', itemTitle: 'Lamp', was: '£40', now: '£30', url: `${BASE}/lists/${s.l.id}/items/${s.it.id}` })
		]);
		expect(mailsFor(s.invited.email)).toHaveLength(1);
		for (const u of [s.owner, s.quiet]) expect(mailsFor(u.email)).toEqual([]);
		const history = await db.select().from(priceHistory).where(eq(priceHistory.linkId, s.linkId));
		expect(history.map((h) => h.price).sort()).toEqual(['30.00', '40.00']);

		// The same price again doesn't send anything new.
		await run(later(4));
		expect(mailsFor(s.viewer.email)).toHaveLength(1);
	});

	it('only tells the person who reserved it once someone has, and no one once it is bought', async () => {
		const s = await scene();
		const sam = await createUser();
		await view(s.l, sam);
		await claim(s.it, sam, 'buying');
		priceIs('40.00');
		await run(T0);
		priceIs('20.00');
		await run(later(2));
		expect(sent.map((m) => m.email)).toEqual([sam.email]);

		const t = await scene();
		await claim(t.it, sam, 'bought');
		await run(later(2));
		expect(await linkRow(t.linkId)).toMatchObject({ lastPrice: null });
		expect(mailsFor(t.viewer.email)).toEqual([]);
	});

	it('keeps telling viewers while an item wanted more than once is still open', async () => {
		const s = await scene({ quantity: 2 });
		await claim(s.it, await createUser(), 'buying');
		priceIs('40.00');
		await run(T0);
		priceIs('30.00');
		await run(later(2));
		expect(mailsFor(s.viewer.email)).toHaveLength(1);
	});

	it('leaves out items only on past or archived lists, and pushes them back a day', async () => {
		const s = await scene({ eventDate: '2020-01-01' });
		priceIs('40.00');
		await run(T0);
		const url = (await linkRow(s.linkId)).url;
		expect(mockMeta.mock.calls.map((c) => c[0])).not.toContain(url);
		expect(await linkRow(s.linkId)).toMatchObject({ lastPrice: null });
		expect((await linkRow(s.linkId)).checkedAt).toBeInstanceOf(Date);
	});

	it('reads at most one link per shop in a run', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const host = `https://shop-${uniq()}.example.com`;
		const a = await addLink(await createItem(owner, {}, { lists: [l] }), `${host}/a`);
		const b = await addLink(await createItem(owner, {}, { lists: [l] }), `${host}/b`);
		priceIs('10.00');
		await run(T0);
		const checked = [await linkRow(a), await linkRow(b)].filter((r) => r.checkedAt);
		expect(checked).toHaveLength(1);
		await run(T0);
		expect([await linkRow(a), await linkRow(b)].every((r) => r.checkedAt)).toBe(true);
	});

	it('marks a link checked when the shop gives no price', async () => {
		const s = await scene();
		priceIs(null);
		await run(T0);
		expect(await linkRow(s.linkId)).toMatchObject({ lastPrice: null });
		expect((await linkRow(s.linkId)).checkedAt).toBeInstanceOf(Date);
	});
});
