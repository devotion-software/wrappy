import { parse, type HTMLElement } from 'node-html-parser';

/** Product details pulled from a shop page. Every field is optional — users can edit or fill in. */
export interface LinkMeta {
	title: string | null;
	description: string | null;
	price: string | null;
	currency: string | null;
	images: string[];
}

const MAX_IMAGES = 12;

/**
 * Parse product details from HTML using, in priority order:
 * JSON-LD Product → OpenGraph / product meta → Twitter cards → <title> / meta description.
 */
export function parseLinkMeta(html: string, pageUrl: string): LinkMeta {
	const root = parse(html, { blockTextElements: { script: true, style: false } });
	const meta = (key: string) => {
		const el =
			root.querySelector(`meta[property="${key}"]`) ?? root.querySelector(`meta[name="${key}"]`);
		const v = el?.getAttribute('content')?.trim();
		return v ? decode(v) : null;
	};
	const metaAll = (key: string) =>
		[
			...root.querySelectorAll(`meta[property="${key}"]`),
			...root.querySelectorAll(`meta[name="${key}"]`)
		]
			.map((el) => el.getAttribute('content')?.trim())
			.filter((v): v is string => !!v);

	const product = findJsonLdProduct(root);

	const title =
		str(product?.name) ??
		meta('og:title') ??
		meta('twitter:title') ??
		(root.querySelector('title')?.text.trim() ? decode(root.querySelector('title')!.text.trim()) : null);

	const description =
		str(product?.description) ?? meta('og:description') ?? meta('twitter:description') ?? meta('description');

	const offer = firstOffer(product?.offers);
	const price =
		normalisePrice(offer?.price ?? offer?.lowPrice ?? offer?.priceSpecification?.price) ??
		normalisePrice(meta('product:price:amount') ?? meta('og:price:amount') ?? meta('price'));
	const currency =
		normaliseCurrency(offer?.priceCurrency ?? offer?.priceSpecification?.priceCurrency) ??
		normaliseCurrency(meta('product:price:currency') ?? meta('og:price:currency'));

	const rawImages = [
		...imageList(product?.image),
		...metaAll('og:image'),
		...metaAll('og:image:secure_url'),
		...metaAll('og:image:url'),
		...metaAll('twitter:image'),
		root.querySelector('link[rel="image_src"]')?.getAttribute('href') ?? ''
	];
	const images: string[] = [];
	for (const raw of rawImages) {
		const abs = absolutise(decode(raw.trim()), pageUrl);
		if (abs && !images.includes(abs)) images.push(abs);
		if (images.length >= MAX_IMAGES) break;
	}

	return {
		title: clip(title, 200),
		description: clip(description, 2000),
		price,
		currency,
		images
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

function findJsonLdProduct(root: HTMLElement): Json | null {
	for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
		let data: Json;
		try {
			data = JSON.parse(script.text);
		} catch {
			continue;
		}
		const found = walk(data);
		if (found) return found;
	}
	return null;

	function walk(node: Json): Json | null {
		if (!node || typeof node !== 'object') return null;
		if (Array.isArray(node)) {
			for (const n of node) {
				const f = walk(n);
				if (f) return f;
			}
			return null;
		}
		const type = node['@type'];
		const types = Array.isArray(type) ? type : [type];
		if (types.some((t) => t === 'Product' || t === 'ProductGroup')) return node;
		if (node['@graph']) return walk(node['@graph']);
		if (node.mainEntity) return walk(node.mainEntity);
		return null;
	}
}

function firstOffer(offers: Json): Json | null {
	if (!offers) return null;
	if (Array.isArray(offers)) return offers[0] ?? null;
	if (offers.offers) return firstOffer(offers.offers);
	return offers;
}

function imageList(img: Json): string[] {
	if (!img) return [];
	if (typeof img === 'string') return [img];
	if (Array.isArray(img)) return img.flatMap(imageList);
	if (typeof img === 'object') return [img.url ?? img.contentUrl].filter(Boolean);
	return [];
}

function str(v: Json): string | null {
	return typeof v === 'string' && v.trim() ? decode(v.trim()) : null;
}

export function normalisePrice(v: Json): string | null {
	if (v === null || v === undefined || v === '') return null;
	let s = String(v).replace(/[^\d.,]/g, '');
	if (!s) return null;
	// "1.234,56" → "1234.56"; "1,234.56" → "1234.56"; "12,50" → "12.50"
	const lastComma = s.lastIndexOf(',');
	const lastDot = s.lastIndexOf('.');
	if (lastComma > lastDot) {
		s = s.replace(/\./g, '').replace(',', '.');
	} else {
		s = s.replace(/,/g, '');
	}
	const n = Number(s);
	if (!Number.isFinite(n) || n < 0 || n >= 100_000_000) return null;
	return n.toFixed(2);
}

function normaliseCurrency(v: Json): string | null {
	if (typeof v !== 'string') return null;
	const c = v.trim().toUpperCase();
	return /^[A-Z]{3}$/.test(c) ? c : null;
}

function absolutise(href: string, base: string): string | null {
	if (!href) return null;
	try {
		const u = new URL(href, base);
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
	} catch {
		return null;
	}
}

function clip(s: string | null, n: number): string | null {
	if (!s) return null;
	const t = s.replace(/\s+/g, ' ').trim();
	return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function decode(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}
