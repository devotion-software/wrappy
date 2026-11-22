import { afterAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { asc, eq } from 'drizzle-orm';
import { db } from './db';
import { itemImage } from './db/schema';
import {
	ImageError,
	MAX_IMAGES_PER_ITEM,
	deleteAllItemImages,
	deleteItemImage,
	importImageFromUrl,
	reorderImages,
	storeItemImage
} from './images';
import { readLocal } from './storage';
import { safeFetch } from './safeFetch';
import { addImageRow, createItem, createUser } from '../../../tests/helpers/fixtures';

vi.mock('./safeFetch', () => ({ safeFetch: vi.fn() }));

/** Items whose stored files must be removed from .uploads after the run. */
const created: string[] = [];
afterAll(async () => {
	for (const id of created) await deleteAllItemImages(id);
});

async function newItem() {
	const it = await createItem(await createUser());
	created.push(it.id);
	return it;
}

const png = (width: number, height: number) =>
	sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
		.png()
		.toBuffer();

const imagesOf = (itemId: string) => db.select().from(itemImage).where(eq(itemImage.itemId, itemId)).orderBy(asc(itemImage.sortOrder));

describe('storeItemImage', () => {
	it('stores WebP thumb and large variants and records the image', async () => {
		const it = await newItem();
		const id = await storeItemImage(it.id, await png(300, 200), 'upload');
		const [row] = await imagesOf(it.id);
		expect(row).toMatchObject({ id, itemId: it.id, source: 'upload', linkId: null, storageKey: `items/${it.id}/${id}`, width: 300, height: 200, sortOrder: 1 });

		const large = await sharp(await readLocal(`${row.storageKey}-large.webp`)).metadata();
		const thumb = await sharp(await readLocal(`${row.storageKey}-thumb.webp`)).metadata();
		expect(large).toMatchObject({ format: 'webp', width: 300, height: 200 });
		expect(thumb).toMatchObject({ format: 'webp', width: 300, height: 200 });
	});

	it('shrinks big pictures to fit 1600px (large) and 480px (thumb)', async () => {
		const it = await newItem();
		await storeItemImage(it.id, await png(3200, 1600), 'upload');
		const [row] = await imagesOf(it.id);
		expect([row.width, row.height]).toEqual([1600, 800]);
		const thumb = await sharp(await readLocal(`${row.storageKey}-thumb.webp`)).metadata();
		expect([thumb.width, thumb.height]).toEqual([480, 240]);
	});

	it('honours EXIF orientation and strips metadata', async () => {
		const it = await newItem();
		// 200×100 stored sideways (orientation 6 = rotate 90° clockwise to display).
		const jpeg = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#3366cc' } })
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toBuffer();
		expect((await sharp(jpeg).metadata()).orientation).toBe(6);
		await storeItemImage(it.id, jpeg, 'link', null);
		const [row] = await imagesOf(it.id);
		expect([row.width, row.height]).toEqual([100, 200]);
		const meta = await sharp(await readLocal(`${row.storageKey}-large.webp`)).metadata();
		expect(meta.exif).toBeUndefined();
		expect(meta.orientation).toBeUndefined();
	});

	it('flattens transparent pictures onto white, so dark products stay visible in dark mode', async () => {
		const it = await newItem();
		// A dark square in the middle of a transparent canvas, like a shop's product PNG.
		const product = await sharp({ create: { width: 40, height: 40, channels: 4, background: { r: 17, g: 17, b: 17, alpha: 1 } } })
			.png()
			.toBuffer();
		const transparent = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
			.composite([{ input: product, top: 30, left: 30 }])
			.png()
			.toBuffer();
		await storeItemImage(it.id, transparent, 'link', null);
		const [row] = await imagesOf(it.id);
		for (const variant of ['large', 'thumb']) {
			const { data, info } = await sharp(await readLocal(`${row.storageKey}-${variant}.webp`))
				.raw()
				.toBuffer({ resolveWithObject: true });
			expect(info.channels).toBe(3);
			const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * 3, (y * info.width + x) * 3 + 3)];
			// Corners were transparent: now white. The middle stays dark.
			for (const v of pixel(2, 2)) expect(v).toBeGreaterThan(245);
			for (const v of pixel(50, 50)) expect(v).toBeLessThan(40);
		}
	});

	it('appends each new picture after the last one', async () => {
		const it = await newItem();
		await addImageRow(it, 4);
		await storeItemImage(it.id, await png(10, 10), 'upload');
		expect((await imagesOf(it.id)).map((r) => r.sortOrder)).toEqual([4, 5]);
	});

	it('remembers the link a picture came from', async () => {
		const it = await newItem();
		await storeItemImage(it.id, await png(10, 10), 'link', 'L'.repeat(22));
		expect((await imagesOf(it.id))[0]).toMatchObject({ source: 'link', linkId: 'L'.repeat(22) });
	});

	it('rejects files that are not pictures', async () => {
		const it = await newItem();
		await expect(storeItemImage(it.id, new TextEncoder().encode('hello'), 'upload')).rejects.toThrow(ImageError);
		await expect(storeItemImage(it.id, new Uint8Array(0), 'upload')).rejects.toThrow(ImageError);
		expect(await imagesOf(it.id)).toEqual([]);
	});

	it('rejects pictures over the size limit', async () => {
		const it = await newItem();
		await expect(storeItemImage(it.id, new Uint8Array(10 * 1024 * 1024 + 1), 'upload')).rejects.toThrow('too big');
	});

	it(`allows at most ${MAX_IMAGES_PER_ITEM} pictures per item`, async () => {
		const it = await newItem();
		for (let i = 1; i <= MAX_IMAGES_PER_ITEM; i++) await addImageRow(it, i);
		await expect(storeItemImage(it.id, await png(10, 10), 'upload')).rejects.toThrow('up to 10 pictures');
		expect(await imagesOf(it.id)).toHaveLength(MAX_IMAGES_PER_ITEM);
	});
});

describe('deleteItemImage', () => {
	it('removes the row and both files', async () => {
		const it = await newItem();
		const id = await storeItemImage(it.id, await png(20, 20), 'upload');
		const key = `items/${it.id}/${id}`;
		await deleteItemImage(it.id, id);
		expect(await imagesOf(it.id)).toEqual([]);
		await expect(readLocal(`${key}-large.webp`)).rejects.toThrow();
		await expect(readLocal(`${key}-thumb.webp`)).rejects.toThrow();
	});

	it("does nothing when the image belongs to another item", async () => {
		const [mine, theirs] = [await newItem(), await newItem()];
		const id = await storeItemImage(theirs.id, await png(20, 20), 'upload');
		await deleteItemImage(mine.id, id);
		expect(await imagesOf(theirs.id)).toHaveLength(1);
		await expect(readLocal(`items/${theirs.id}/${id}-large.webp`)).resolves.toBeTruthy();
		await deleteItemImage(mine.id, 'missing');
	});
});

describe('deleteAllItemImages', () => {
	it('removes the stored files for every image of an item', async () => {
		const it = await createItem(await createUser());
		const a = await storeItemImage(it.id, await png(20, 20), 'upload');
		const b = await storeItemImage(it.id, await png(20, 20), 'upload');
		await deleteAllItemImages(it.id);
		for (const id of [a, b]) await expect(readLocal(`items/${it.id}/${id}-thumb.webp`)).rejects.toThrow();
	});
});

describe('reorderImages', () => {
	it('applies the new order, ignoring foreign ids and keeping missing ones at the end', async () => {
		const [it, other] = [await newItem(), await newItem()];
		const a = await addImageRow(it, 1);
		const b = await addImageRow(it, 2);
		const c = await addImageRow(it, 3);
		const foreign = await addImageRow(other, 1);
		await reorderImages(it.id, [c, foreign, a]);
		expect((await imagesOf(it.id)).map((r) => [r.id, r.sortOrder])).toEqual([
			[c, 1],
			[a, 2],
			[b, 3]
		]);
		expect((await imagesOf(other.id))[0]).toMatchObject({ id: foreign, sortOrder: 1 });
	});
});

describe('importImageFromUrl', () => {
	it('stores a fetched picture as a link image', async () => {
		const it = await newItem();
		vi.mocked(safeFetch).mockResolvedValueOnce({ url: 'https://shop.test/a.png', contentType: 'image/png', body: await png(40, 30) });
		await importImageFromUrl(it.id, 'https://shop.test/a.png', 'K'.repeat(22));
		expect(safeFetch).toHaveBeenLastCalledWith('https://shop.test/a.png', expect.objectContaining({ accept: 'image/*' }));
		expect((await imagesOf(it.id))[0]).toMatchObject({ source: 'link', linkId: 'K'.repeat(22), width: 40, height: 30 });
	});

	it('rejects responses that are not images', async () => {
		const it = await newItem();
		vi.mocked(safeFetch).mockResolvedValueOnce({ url: 'https://shop.test/', contentType: 'text/html', body: await png(10, 10) });
		await expect(importImageFromUrl(it.id, 'https://shop.test/', null)).rejects.toThrow('not a picture');
		expect(await imagesOf(it.id)).toEqual([]);
	});
});
