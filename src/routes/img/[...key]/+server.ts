import { error, redirect } from '@sveltejs/kit';
import { presignGet, readLocal, usingR2 } from '#lib/server/storage';
import type { RequestHandler } from './$types';

// Only our own generated keys: items/<itemId>/<imageId>-(thumb|large).webp
const KEY = /^items\/[0-9A-Za-z]{22}\/[0-9A-Za-z]{22}-(thumb|large)\.webp$/;

export const GET: RequestHandler = async ({ params, setHeaders }) => {
	const key = params.key;
	if (!KEY.test(key)) error(404, 'Not found');

	if (usingR2) {
		setHeaders({ 'cache-control': 'private, max-age=3000' });
		redirect(302, await presignGet(key, 3600));
	}
	try {
		const body = await readLocal(key);
		return new Response(body as BodyInit, {
			headers: {
				'content-type': 'image/webp',
				// Keys are immutable: a changed image gets a new id. Private so shared caches/CDNs
				// don't keep pictures of private items around after they're deleted.
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch {
		error(404, 'Not found');
	}
};
