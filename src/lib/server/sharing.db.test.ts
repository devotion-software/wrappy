import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { listShare } from './db/schema';
import { claimInvitesForUser } from './sharing';
import { createList, createUser, share, uniq } from '../../../tests/helpers/fixtures';

const shareRow = async (id: string) => (await db.select().from(listShare).where(eq(listShare.id, id)))[0];

describe('claimInvitesForUser', () => {
	it('links pending invites for that email (case-insensitively) to the new account', async () => {
		const owner = await createUser();
		const [l1, l2] = [await createList(owner), await createList(owner)];
		const email = `new-${uniq()}@example.test`;
		const s1 = await share(l1, { email });
		const s2 = await share(l2, { email });
		const otherInvite = await share(l1, { email: `someone-${uniq()}@example.test` });

		const u = await createUser({ email });
		await claimInvitesForUser(u.id, email.toUpperCase());

		expect((await shareRow(s1)).userId).toBe(u.id);
		expect((await shareRow(s2)).userId).toBe(u.id);
		expect((await shareRow(otherInvite)).userId).toBeNull();
	});

	it('leaves invites already linked to another account alone', async () => {
		const owner = await createUser();
		const l = await createList(owner);
		const email = `old-${uniq()}@example.test`;
		const first = await createUser();
		const s = await share(l, { email, id: first.id });
		const second = await createUser();
		await claimInvitesForUser(second.id, email);
		expect((await shareRow(s)).userId).toBe(first.id);
	});
});
