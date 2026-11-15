import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db';
import { itemImage } from '#lib/server/db/schema';
import { deleteAllItemImages } from '#lib/server/images';
import { deleteObject, putObject, readLocal } from '#lib/server/storage';
import { newId } from '#lib/server/ids';
import { createItem, createUser } from '../helpers/fixtures';
import { fakeEvent, outcome } from '../helpers/event';
import { POST as upload } from '../../src/routes/api/items/[id]/images/+server';
import { GET as img } from '../../src/routes/img/[...key]/+server';
import { GET as healthz } from '../../src/routes/healthz/+server';

const cleanup: (() => Promise<unknown>)[] = [];
afterAll(async () => {
	for (const fn of cleanup) await fn();
});

const png = () =>
	sharp({ create: { width: 64, height: 40, channels: 3, background: '#c9a24a' } })
		.png()
		.toBuffer();

const post = (user: any, itemId: string, fields: Record<string, any>) =>
	outcome(() => (upload as any)(fakeEvent({ user, params: { id: itemId }, form: fields })));

async function json(o: any) {
	expect(o.kind).toBe('ok');
	return { status: (o.data as Response).status, body: await (o.data as Response).json() };
}

describe('POST /api/items/[id]/images', () => {
	it('requires sign-in', async () => {
		const it = await createItem(await createUser());
		expect(await post(null, it.id, {})).toMatchObject({ kind: 'error', status: 401 });
	});

	it("404s for someone else's item", async () => {
		const it = await createItem(await createUser());
		expect(await post(await createUser(), it.id, { file: new File([await png()], 'a.png') })).toMatchObject({
			kind: 'error',
			status: 404
		});
		expect(await db.select().from(itemImage).where(eq(itemImage.itemId, it.id))).toEqual([]);
	});

	it('asks for a file when none is sent', async () => {
		const me = await createUser();
		const it = await createItem(me);
		expect(await json(await post(me, it.id, { file: 'not a file' }))).toEqual({
			status: 400,
			body: { error: 'Choose a picture to upload.' }
		});
	});

	it('rejects files that are not pictures', async () => {
		const me = await createUser();
		const it = await createItem(me);
		const res = await json(await post(me, it.id, { file: new File(['hello'], 'notes.txt', { type: 'text/plain' }) }));
		expect(res.status).toBe(400);
		expect(res.body.error).toMatch(/isn't a picture/);
	});

	it('stores a real picture as thumb and large WebP variants', async () => {
		const me = await createUser();
		const it = await createItem(me);
		cleanup.push(() => deleteAllItemImages(it.id));
		expect(await json(await post(me, it.id, { file: new File([await png()], 'a.png', { type: 'image/png' }) }))).toEqual({
			status: 200,
			body: { ok: true }
		});
		const [row] = await db.select().from(itemImage).where(eq(itemImage.itemId, it.id));
		expect(row).toMatchObject({ source: 'upload', width: 64, height: 40, storageKey: `items/${it.id}/${row.id}` });
		for (const v of ['thumb', 'large']) {
			const meta = await sharp(Buffer.from(await readLocal(`${row.storageKey}-${v}.webp`))).metadata();
			expect(meta.format).toBe('webp');
		}
	});
});

describe('GET /img/[...key]', () => {
	const get = (key: string) => {
		const ev = fakeEvent({ params: { key } });
		return { ev, run: outcome(() => (img as any)(ev)) };
	};

	it.each([
		'',
		'../.env',
		'items/../../etc/passwd',
		'items/short/short-thumb.webp',
		`items/${'a'.repeat(22)}/${'b'.repeat(22)}-medium.webp`,
		`items/${'a'.repeat(22)}/${'b'.repeat(22)}-thumb.png`,
		`other/${'a'.repeat(22)}/${'b'.repeat(22)}-thumb.webp`
	])('404s for key %j', async (key) => {
		expect(await get(key).run).toMatchObject({ kind: 'error', status: 404 });
	});

	it('404s for a well-formed key with no file', async () => {
		expect(await get(`items/${newId()}/${newId()}-thumb.webp`).run).toEqual({ kind: 'error', status: 404, message: 'Not found' });
	});

	it('serves a stored local file privately and immutably', async () => {
		const key = `items/${newId()}/${newId()}-large.webp`;
		const bytes = new Uint8Array([1, 2, 3, 4]);
		await putObject(key, bytes, 'image/webp');
		cleanup.push(() => deleteObject(key));
		const o = await get(key).run;
		expect(o.kind).toBe('ok');
		const res = (o as any).data as Response;
		expect(res.headers.get('content-type')).toBe('image/webp');
		expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
	});
});

describe('GET /healthz', () => {
	it('reports ok while the database is reachable', async () => {
		const res = (await (healthz as any)(fakeEvent())) as Response;
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('ok');
		expect(res.headers.get('cache-control')).toBe('no-store');
	});
});
