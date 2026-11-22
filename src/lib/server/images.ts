import sharp, { type Sharp, type Metadata } from 'sharp';
import { and, asc, count, eq, max } from 'drizzle-orm';
import { db } from './db';
import { itemImage } from './db/schema';
import { newId } from './ids';
import { deleteObject, putObject } from './storage';
import { safeFetch } from './safeFetch';

export const MAX_IMAGES_PER_ITEM = 10;
export const MAX_IMAGE_BYTES = Number(process.env.UPLOAD_MAX_MB ?? 10) * 1024 * 1024;

export class ImageError extends Error {}

/**
 * Normalise an image (honour EXIF orientation, flatten transparency onto white, then strip all
 * metadata incl. GPS), store WebP thumb + large variants, and record it against the item.
 */
export async function storeItemImage(
	itemId: string,
	bytes: Uint8Array,
	source: 'upload' | 'link',
	linkId: string | null = null
) {
	const [{ n }] = await db.select({ n: count() }).from(itemImage).where(eq(itemImage.itemId, itemId));
	if (n >= MAX_IMAGES_PER_ITEM) throw new ImageError(`An item can have up to ${MAX_IMAGES_PER_ITEM} pictures.`);
	if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageError('That picture is too big. The limit is 10 MB.');

	let base: Sharp;
	let meta: Metadata;
	try {
		// Flatten transparency onto white: shop pictures are made for a white page, and a dark
		// product on a transparent background vanishes against the dark theme.
		base = sharp(bytes, { limitInputPixels: 50_000_000 }).rotate().flatten({ background: '#ffffff' });
		meta = await base.metadata();
	} catch {
		throw new ImageError("That file isn't a picture we can read. Try a JPG, PNG, WebP or HEIC.");
	}
	if (!meta.width || !meta.height) throw new ImageError("That file isn't a picture we can read.");

	const [large, thumb] = await Promise.all([
		base.clone().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true }),
		base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer()
	]);

	const id = newId();
	const key = `items/${itemId}/${id}`;
	await Promise.all([
		putObject(`${key}-large.webp`, large.data, 'image/webp'),
		putObject(`${key}-thumb.webp`, thumb, 'image/webp')
	]);

	const [{ m }] = await db.select({ m: max(itemImage.sortOrder) }).from(itemImage).where(eq(itemImage.itemId, itemId));
	await db.insert(itemImage).values({
		id,
		itemId,
		source,
		linkId,
		storageKey: key,
		width: large.info.width,
		height: large.info.height,
		sortOrder: (m ?? 0) + 1
	});
	return id;
}

/** Copy a remote image (found on a shop page) into our storage. */
export async function importImageFromUrl(itemId: string, url: string, linkId: string | null) {
	const res = await safeFetch(url, { accept: 'image/*', maxBytes: MAX_IMAGE_BYTES, timeoutMs: 10000 });
	if (!res.contentType.startsWith('image/')) throw new ImageError('That link is not a picture.');
	return storeItemImage(itemId, res.body, 'link', linkId);
}

export async function deleteItemImage(itemId: string, imageId: string) {
	const [img] = await db
		.select()
		.from(itemImage)
		.where(and(eq(itemImage.id, imageId), eq(itemImage.itemId, itemId)))
		.limit(1);
	if (!img) return;
	await db.delete(itemImage).where(eq(itemImage.id, imageId));
	await Promise.all([deleteObject(`${img.storageKey}-large.webp`), deleteObject(`${img.storageKey}-thumb.webp`)]);
}

/** Delete every stored file for an item's images (call before deleting the item row). */
export async function deleteAllItemImages(itemId: string) {
	const imgs = await db.select().from(itemImage).where(eq(itemImage.itemId, itemId));
	await Promise.all(
		imgs.flatMap((img) => [deleteObject(`${img.storageKey}-large.webp`), deleteObject(`${img.storageKey}-thumb.webp`)])
	);
}

/** Persist a new image order; ids not belonging to the item are ignored. */
export async function reorderImages(itemId: string, orderedIds: string[]) {
	const imgs = await db
		.select({ id: itemImage.id })
		.from(itemImage)
		.where(eq(itemImage.itemId, itemId))
		.orderBy(asc(itemImage.sortOrder));
	const valid = new Set(imgs.map((i) => i.id));
	const order = [...orderedIds.filter((id) => valid.has(id)), ...imgs.map((i) => i.id).filter((id) => !orderedIds.includes(id))];
	await db.transaction(async (tx) => {
		for (const [i, id] of order.entries()) {
			await tx.update(itemImage).set({ sortOrder: i + 1 }).where(eq(itemImage.id, id));
		}
	});
}
