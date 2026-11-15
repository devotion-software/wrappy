import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { user } from './db/schema';
import { setUsername, usernameTaken } from './username';
import { createUser, uniq } from '../../../tests/helpers/fixtures';

const usernameOf = async (id: string) => (await db.select({ u: user.username }).from(user).where(eq(user.id, id)))[0].u;

describe('usernameTaken', () => {
	it('is true only when someone else has it', async () => {
		const name = `taken.${uniq()}`;
		const owner = await createUser({ username: name });
		const other = await createUser();
		expect(await usernameTaken(name, other.id)).toBe(true);
		expect(await usernameTaken(name, owner.id)).toBe(false);
		expect(await usernameTaken(`free.${uniq()}`, other.id)).toBe(false);
	});
});

describe('setUsername', () => {
	it('normalises case, spaces and a leading @', async () => {
		const u = await createUser();
		const name = `jo.${uniq()}`;
		expect(await setUsername(u.id, `  @${name.toUpperCase()} `)).toBeNull();
		expect(await usernameOf(u.id)).toBe(name);
	});

	it('rejects invalid and reserved names without saving', async () => {
		const u = await createUser();
		expect(await setUsername(u.id, 'ab')).toBe('Usernames are 3 to 30 characters.');
		expect(await setUsername(u.id, 'bad name!')).toBe('Use lowercase letters, numbers, dots, dashes or underscores.');
		expect(await setUsername(u.id, 'admin')).toBe('That username is taken.');
		expect(await setUsername(u.id, '@Lists')).toBe('That username is taken.');
		expect(await usernameOf(u.id)).toBeNull();
	});

	it("refuses someone else's username", async () => {
		const name = `sam.${uniq()}`;
		await createUser({ username: name });
		const u = await createUser();
		expect(await setUsername(u.id, name)).toBe('That username is taken. Try another.');
		expect(await setUsername(u.id, name.toUpperCase())).toBe('That username is taken. Try another.');
		expect(await usernameOf(u.id)).toBeNull();
	});

	it('lets me keep or change my own username', async () => {
		const name = `me.${uniq()}`;
		const u = await createUser({ username: name });
		expect(await setUsername(u.id, name)).toBeNull();
		const next = `me2.${uniq()}`;
		expect(await setUsername(u.id, next)).toBeNull();
		expect(await usernameOf(u.id)).toBe(next);
		// The old name is free again.
		expect(await usernameTaken(name, (await createUser()).id)).toBe(false);
	});
});
