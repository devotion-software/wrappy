import { parseLinkMeta, type LinkMeta } from './linkMeta';
import { safeFetch, validateUrl } from './safeFetch';

/** Looks like a web link the user pasted (vs. a free-text wish). */
export function looksLikeUrl(s: string): boolean {
	const t = s.trim();
	if (/\s/.test(t)) return false;
	if (/^https?:\/\//i.test(t)) return true;
	return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t);
}

/**
 * What was shared to Wrappy (bookmarklet or the phone's share sheet): the link, plus a title.
 * Share sheets often put the link inside `text` ("Look at this https://…"), so look there too.
 * Returns null when there's nothing to add.
 */
export function readShared(params: { url?: string | null; title?: string | null; text?: string | null }): {
	url: string | null;
	title: string | null;
} | null {
	const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim();
	const text = clean(params.text);
	let title = clean(params.title) || null;
	let url = clean(params.url) || null;
	if (!url) {
		const m = /https?:\/\/[^\s<>"]+/i.exec(text);
		if (m) url = m[0].replace(/[).,!?'"]+$/, '');
		else if (looksLikeUrl(text)) url = text;
	}
	if (url) {
		try {
			url = normaliseUrl(url);
		} catch {
			url = null;
		}
	}
	// Plain text with no link (e.g. a note shared from another app) becomes the item's name.
	if (!title && !url && text) title = text;
	if (title && title.length > 200) title = `${title.slice(0, 199)}…`;
	return url || title ? { url, title } : null;
}

export function normaliseUrl(s: string): string {
	const t = s.trim();
	// Only add https:// when there's no scheme at all; other schemes (ftp://…) go to validateUrl and are rejected.
	return validateUrl(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`).toString();
}

/** Fetch a shop page and pull product details. Returns null if the page can't be read. */
export async function fetchLinkMeta(url: string): Promise<LinkMeta | null> {
	try {
		const res = await safeFetch(url, {
			accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
			maxBytes: 3 * 1024 * 1024
		});
		if (!/html|xml/i.test(res.contentType)) return null;
		const html = new TextDecoder('utf-8', { fatal: false }).decode(res.body);
		const meta = parseLinkMeta(html, res.url);
		// A page with nothing useful (bot wall, consent page) counts as a failed pull.
		if (!meta.title && !meta.images.length && !meta.price) return null;
		if (meta.title && /access denied|robot|captcha|just a moment|attention required/i.test(meta.title)) return null;
		return meta;
	} catch {
		return null;
	}
}
