import { error, json } from '@sveltejs/kit';
import { requireOwnItem } from '#lib/server/items';
import { ImageError, storeItemImage, MAX_IMAGE_BYTES } from '#lib/server/images';
import type { RequestHandler } from './$types';

/** Upload one picture to an item (the client sends files one at a time). */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) error(401, 'Log in first');
	await requireOwnItem(locals.user.id, params.id);
	const file = (await request.formData()).get('file');
	if (!(file instanceof File)) return json({ error: 'Choose a picture to upload.' }, { status: 400 });
	if (file.size > MAX_IMAGE_BYTES) return json({ error: `${file.name} is over the 10 MB limit.` }, { status: 413 });
	try {
		await storeItemImage(params.id, new Uint8Array(await file.arrayBuffer()), 'upload');
		return json({ ok: true });
	} catch (e) {
		if (e instanceof ImageError) return json({ error: e.message }, { status: 400 });
		throw e;
	}
};
