import { formatDate, plural } from './format';

/**
 * What a shared link unfurls as (Open Graph / Twitter cards). Pages return it from `load` as
 * `meta`; the root layout renders the tags, falling back to a generic card.
 *
 * Only pages that already checked the viewer may see the list return one, so a private list's
 * title never reaches a crawler that lacks the share link.
 */
export interface PageMeta {
	title: string;
	description: string;
}

export const SITE_META: PageMeta = {
	title: 'Wishlist',
	description: 'Write a wish list, share it, and keep the surprise.'
};

/** "Meg's wish list · 12 wishes · 24 Dec" */
export function listMeta(l: { title: string; eventDate: string | null }, ownerName: string, wishCount: number): PageMeta {
	const parts = [`${ownerName}'s wish list`, plural(wishCount, 'wish', 'wishes')];
	const when = formatDate(l.eventDate);
	if (when) parts.push(when);
	return { title: l.title, description: parts.join(' · ') };
}

/**
 * Link-preview fetchers (Slack, WhatsApp, iMessage, Facebook, X, Discord, Telegram, LinkedIn…).
 * iMessage identifies as "facebookexternalhit … Twitterbot".
 */
const PREVIEW_BOT =
	/bot\b|bot\/|facebookexternalhit|facebot|whatsapp|slack|telegram|discord|linkedin|skypeuripreview|embedly|iframely|pinterest|vkshare|redditbot|applebot|mastodon|bluesky|cardyb|preview/i;

export function isPreviewBot(userAgent: string | null): boolean {
	return !!userAgent && PREVIEW_BOT.test(userAgent);
}
