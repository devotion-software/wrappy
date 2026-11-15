/**
 * Turn a pasted list (from a note, a message, a markdown checklist…) into wishes.
 * Shared by the browser preview and the server, so both agree on what gets added.
 *
 * Handles one wish per line with any of these in front: `-`, `*`, `+`, `•`, `1.`, `1)`, `(1)`,
 * `- [ ]`, `- [x]`, `[ ]`, `☐`, `✅`. A list that a notes app flattened onto one line
 * (`- socks - book`, `1. socks 2. book`, `- [ ] socks - [ ] book`) is split back up.
 * A link in a line is kept as the wish's link, and a price with a currency (`£12`, `20 EUR`) as its price.
 */

export interface PastedWish {
	title: string;
	url: string | null;
	price: string | null;
	currency: string | null;
}

export const MAX_PASTED_WISHES = 100;
const MAX_TITLE = 200;

const BULLET = /^[-*+•●▪◦·–—]\s*/;
const CHECKBOX = /^(?:\[[ xX✓✔]?\]|[☐☑☒✓✔✅⬜🔲])\s*/u;
const NUMBER = /^\(?\d{1,3}[.)]\s+/;

function stripMarkers(line: string): string {
	let s = line.trim().replace(/^>\s*/, '');
	for (let i = 0; i < 3; i++) {
		const next = s.replace(BULLET, '').replace(CHECKBOX, '').replace(NUMBER, '');
		if (next === s) break;
		s = next;
	}
	return s.trim();
}

/** A notes app sometimes pastes a whole list as one line; split it back into items. */
function splitFlattened(line: string): string[] {
	const t = line.trim();
	if (/^-\s*\[[ xX]?\]/.test(t)) return t.split(/\s+(?=-\s*\[[ xX]?\])/);
	if (/^\[[ xX]?\]/.test(t)) return t.split(/\s+(?=\[[ xX]?\])/);
	if (/^[-•*]\s/.test(t)) return t.split(/\s+(?=[-•*]\s)/);
	if (/^\(?1[.)]\s/.test(t)) return t.split(/\s+(?=\(?\d{1,3}[.)]\s)/);
	return [t];
}

const SYMBOLS: Record<string, string> = { '£': 'GBP', '€': 'EUR', $: 'USD', '¥': 'JPY', '₹': 'INR' };
const CODES = 'GBP|EUR|USD|CAD|AUD|NZD|CHF|SEK|NOK|DKK|JPY|INR';
const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const PRICE_BEFORE = new RegExp(String.raw`(?:^|\s|\()([£€$¥₹]|(?:${CODES})\s?)\s?${AMOUNT}(?=$|[\s),;])`, 'i');
const PRICE_AFTER = new RegExp(String.raw`(?:^|\s|\()${AMOUNT}\s?([£€]|${CODES}\b)`, 'i');

function money(whole: string, cents: string | undefined) {
	const n = Number(`${whole.replace(/,/g, '')}.${cents ?? '0'}`);
	return Number.isFinite(n) && n < 100_000_000 ? n.toFixed(2) : null;
}

function takePrice(s: string): { rest: string; price: string | null; currency: string | null } {
	let m = PRICE_BEFORE.exec(s);
	if (m) {
		const sym = m[1].trim().toUpperCase();
		const price = money(m[2], m[3]);
		if (price) return { rest: s.replace(m[0], m[0].startsWith('(') ? ' (' : ' '), price, currency: SYMBOLS[sym] ?? sym };
	}
	m = PRICE_AFTER.exec(s);
	if (m) {
		const sym = m[3].trim().toUpperCase();
		const price = money(m[1], m[2]);
		if (price) return { rest: s.replace(m[0], m[0].startsWith('(') ? ' (' : ' '), price, currency: SYMBOLS[sym] ?? sym };
	}
	return { rest: s, price: null, currency: null };
}

const URL_RE = /\bhttps?:\/\/[^\s<>()]+|\bwww\.[^\s<>()]+/i;

function hostOf(url: string): string | null {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return null;
	}
}

function parseLine(raw: string): PastedWish | null {
	let s = stripMarkers(raw);
	// Skip headings, rules and empty lines.
	if (!s || /^#{1,6}\s/.test(s) || /^([-*_=])\1{2,}$/.test(s)) return null;

	// Markdown links: [Title](https://…)
	let url: string | null = null;
	const md = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i.exec(s);
	if (md) {
		url = md[2];
		s = s.replace(md[0], md[1]);
	} else {
		const u = URL_RE.exec(s);
		if (u) {
			url = u[0].replace(/[.,;:!?]+$/, '');
			if (!/^https?:/i.test(url)) url = `https://${url}`;
			s = s.replace(u[0], ' ');
		}
	}
	if (url && !hostOf(url)) url = null;

	const { rest, price, currency } = takePrice(s);
	let title = rest
		.replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
		.replace(/\(\s*\)/g, '')
		.replace(/\s+/g, ' ')
		.replace(/^[\s\-–—:|,·]+|[\s\-–—:|,·]+$/g, '')
		.trim();
	if (!title && url) title = hostOf(url) ?? '';
	if (!title) return null;
	if (title.length > MAX_TITLE) title = `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
	return { title, url, price, currency };
}

export function parsePastedList(text: string): PastedWish[] {
	const lines = text.split(/\r?\n/).filter((l) => l.trim());
	const parts = lines.length === 1 ? splitFlattened(lines[0]) : lines;
	const seen = new Set<string>();
	const out: PastedWish[] = [];
	for (const p of parts) {
		const w = parseLine(p);
		if (!w) continue;
		const key = w.title.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(w);
	}
	return out;
}
