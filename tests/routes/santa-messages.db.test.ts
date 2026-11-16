import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { santa, santaMessage } from '#lib/server/db/schema';
import { setEmailPrefs } from '#lib/server/emailPrefs';
import { addSantaMember, createSanta, createUser, setDrawn, type TestUser } from '../helpers/fixtures';
import { fakeEvent, ok, outcome } from '../helpers/event';

const sent = vi.hoisted(() => [] as any[]);
vi.mock('#lib/server/email', () => ({
	sendSantaMessageEmail: async (opts: unknown) => void sent.push(opts),
	sendSantaAssignmentEmail: vi.fn(),
	sendOtpEmail: vi.fn(),
	sendListInviteEmail: vi.fn()
}));
vi.mock('#lib/server/rateLimit', async (importActual) => ({
	...(await importActual<typeof import('#lib/server/rateLimit')>()),
	takeMessageBudget: vi.fn(async () => true)
}));

const { load, actions } = await import('../../src/routes/(app)/santa/[id]/+page.server');
const { takeMessageBudget } = await import('#lib/server/rateLimit');

beforeEach(() => {
	sent.length = 0;
	vi.mocked(takeMessageBudget).mockResolvedValue(true);
});

const ev = (me: TestUser, id: string, form?: Record<string, string>) => fakeEvent({ user: me, params: { id }, path: `/santa/${id}`, form });
const send = (me: TestUser, id: string, to: string, body: string) => outcome(() => actions.message(ev(me, id, { to, body }) as any));
const threadsOf = async (me: TestUser, id: string) => (await ok<any>(() => load(ev(me, id) as any))).threads;

/** Ann buys for Bob, Bob for Cat, Cat for Ann. Olive organises without playing. */
async function scene(drawn = true) {
	const org = await createUser({ name: 'Olive' });
	const [a, b, c] = [await createUser({ name: 'Ann' }), await createUser({ name: 'Bob' }), await createUser({ name: 'Cat' })];
	const s = await createSanta(org, { name: 'Office' });
	for (const m of [a, b, c]) await addSantaMember(s, m);
	if (drawn)
		await setDrawn(s, [
			[a, b],
			[b, c],
			[c, a]
		]);
	return { org, a, b, c, s };
}

describe('Secret Santa messages', () => {
	it('has no conversations before names are drawn, and refuses to send', async () => {
		const { a, s } = await scene(false);
		expect(await threadsOf(a, s.id)).toEqual({ toRecipient: null, toSanta: null });
		expect(await send(a, s.id, 'recipient', 'Hi')).toMatchObject({ kind: 'fail', status: 400 });
	});

	it('lets a Santa ask a question and the recipient reply, without naming the Santa', async () => {
		const { a, b, s } = await scene();
		expect(await send(a, s.id, 'recipient', '  What size are you?  ')).toEqual({ kind: 'ok', data: { messageSent: 'recipient' } });

		// Bob sees it in his "your Santa" thread; nothing in his page data says it was Ann.
		const bobData = await ok<any>(() => load(ev(b, s.id) as any));
		expect(bobData.threads.toSanta).toEqual([expect.objectContaining({ mine: false, body: 'What size are you?' })]);
		expect(JSON.stringify(bobData.threads)).not.toContain(a.id);
		expect(sent).toEqual([expect.objectContaining({ email: b.email, from: 'Your Secret Santa', preview: 'What size are you?' })]);

		expect(await send(b, s.id, 'santa', 'Medium, thanks!')).toMatchObject({ kind: 'ok' });
		expect((await threadsOf(a, s.id)).toRecipient.map((m: any) => [m.mine, m.body])).toEqual([
			[true, 'What size are you?'],
			[false, 'Medium, thanks!']
		]);
		// Ann knows who she drew, so the reply is from Bob by name.
		expect(sent[1]).toMatchObject({ email: a.email, from: 'Bob' });
	});

	it('keeps each pair separate', async () => {
		const { a, b, c, s } = await scene();
		await send(a, s.id, 'recipient', 'For Bob');
		await send(b, s.id, 'recipient', 'For Cat');
		expect((await threadsOf(c, s.id)).toSanta.map((m: any) => m.body)).toEqual(['For Cat']);
		expect((await threadsOf(c, s.id)).toRecipient).toEqual([]);
		expect((await threadsOf(b, s.id)).toSanta.map((m: any) => m.body)).toEqual(['For Bob']);
	});

	it('emails once for a quick run of messages, and not at all if Santa emails are off', async () => {
		const { a, b, c, s } = await scene();
		await send(a, s.id, 'recipient', 'One');
		await send(a, s.id, 'recipient', 'Two');
		expect(sent).toHaveLength(1);
		await setEmailPrefs(a.id, { santa: false });
		await send(c, s.id, 'recipient', 'Hello Ann');
		expect(sent).toHaveLength(1);
		expect(await db.select().from(santaMessage).where(eq(santaMessage.santaId, s.id))).toHaveLength(3);
		void b;
	});

	it('rejects empty and overlong messages, people not playing, unknown threads and too many sends', async () => {
		const { org, a, s } = await scene();
		expect(await send(a, s.id, 'recipient', '   ')).toEqual({ kind: 'fail', status: 400, data: { messageError: { to: 'recipient', message: 'Write a message first.' } } });
		expect(await send(a, s.id, 'recipient', 'x'.repeat(1001))).toMatchObject({ kind: 'fail', status: 400 });
		expect(await send(org, s.id, 'recipient', 'Hi')).toMatchObject({ kind: 'error', status: 403 });
		expect(await send(await createUser(), s.id, 'recipient', 'Hi')).toMatchObject({ kind: 'error', status: 404 });
		expect(await send(a, s.id, 'someone', 'Hi')).toMatchObject({ kind: 'error', status: 400 });
		vi.mocked(takeMessageBudget).mockResolvedValue(false);
		expect(await send(a, s.id, 'recipient', 'Hi')).toMatchObject({ kind: 'fail', status: 429 });
		expect(await db.select().from(santaMessage).where(eq(santaMessage.santaId, s.id))).toEqual([]);
	});

	it('goes with the exchange when it is deleted', async () => {
		const { a, s } = await scene();
		await send(a, s.id, 'recipient', 'Hi');
		await db.delete(santa).where(eq(santa.id, s.id));
		expect(await db.select().from(santaMessage).where(eq(santaMessage.santaId, s.id))).toEqual([]);
	});
});
