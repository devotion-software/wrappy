import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { deleteObject, putObject, readLocal, usingR2 } from './storage';

const root = path.resolve('.uploads');
const prefix = `test-${Math.random().toString(36).slice(2, 10)}`;
const bytes = (s: string) => new TextEncoder().encode(s);
const exists = (p: string) =>
	fs.stat(p).then(
		() => true,
		() => false
	);

afterAll(async () => {
	await fs.rm(path.join(root, prefix), { recursive: true, force: true });
});

describe('local storage (no R2 configured)', () => {
	it('is used in tests', () => expect(usingR2).toBe(false));

	it('writes, reads back and deletes an object, creating folders as needed', async () => {
		const key = `${prefix}/items/a/b-thumb.webp`;
		await putObject(key, bytes('picture'), 'image/webp');
		expect(await exists(path.join(root, key))).toBe(true);
		expect(new TextDecoder().decode(await readLocal(key))).toBe('picture');

		await deleteObject(key);
		expect(await exists(path.join(root, key))).toBe(false);
		await expect(readLocal(key)).rejects.toThrow();
	});

	it('overwrites an existing object', async () => {
		const key = `${prefix}/over.webp`;
		await putObject(key, bytes('one'), 'image/webp');
		await putObject(key, bytes('two'), 'image/webp');
		expect(new TextDecoder().decode(await readLocal(key))).toBe('two');
	});

	it('does not throw when deleting something that is not there', async () => {
		await expect(deleteObject(`${prefix}/missing.webp`)).resolves.toBeUndefined();
	});

	it.each([
		[`${prefix}/../../escape.txt`, `${prefix}/escape.txt`],
		[`/${prefix}/abs.txt`, `${prefix}/abs.txt`],
		[`${prefix}\\..\\..\\win.txt`, `${prefix}/win.txt`],
		[`${prefix}/a/..../b.txt`, `${prefix}/a/b.txt`]
	])('keeps traversal key %j inside the uploads folder', async (key, landsAt) => {
		await putObject(key, bytes('x'), 'text/plain');
		expect(await exists(path.join(root, landsAt))).toBe(true);
		expect(await exists(path.resolve(root, '..', 'escape.txt'))).toBe(false);
		expect(new TextDecoder().decode(await readLocal(key))).toBe('x');
	});

	it('cannot read files outside the uploads folder', async () => {
		await expect(readLocal('../package.json')).rejects.toThrow();
		await expect(readLocal('../../../../etc/hosts')).rejects.toThrow();
	});
});
