import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { Agent, fetch, type Response } from 'undici';
import { isPublicAddress } from './netGuard';

/**
 * Fetch an untrusted, user-supplied URL safely:
 *  - http(s) only, default ports only
 *  - every DNS answer is checked at connect time (no DNS-rebinding window)
 *  - redirects followed manually (max 4), each re-validated
 *  - hard timeout and response size cap
 */

export class FetchBlockedError extends Error {}

const agent = new Agent({
	connect: {
		timeout: 5000,
		lookup(hostname, options, callback) {
			dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
				if (err) return callback(err, '', 4);
				const list = (addresses as unknown as { address: string; family: number }[]) ?? [];
				const ok = list.filter((a) => isPublicAddress(a.address));
				if (!ok.length || ok.length !== list.length) {
					return callback(new FetchBlockedError(`Blocked address for ${hostname}`), '', 4);
				}
				if ((options as { all?: boolean }).all) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					return (callback as any)(null, ok);
				}
				callback(null, ok[0].address, ok[0].family);
			});
		}
	}
});

const UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 WishlistBot/1.0';

export function validateUrl(raw: string): URL {
	let u: URL;
	try {
		u = new URL(raw.trim());
	} catch {
		throw new FetchBlockedError('Not a valid URL');
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new FetchBlockedError('Only web links are supported');
	if (u.port && u.port !== '80' && u.port !== '443') throw new FetchBlockedError('Unsupported port');
	if (u.username || u.password) throw new FetchBlockedError('Links with credentials are not supported');
	// Node connects to IP-literal hosts without calling the agent's DNS lookup, so check them here.
	// (The URL parser has already normalised forms like http://2130706433/ to dotted IPv4.)
	const host = u.hostname.replace(/^\[|\]$/g, '');
	if (isIP(host) && !isPublicAddress(host)) throw new FetchBlockedError('Blocked address');
	return u;
}

export async function safeFetch(
	raw: string,
	opts: { accept: string; maxBytes: number; timeoutMs?: number }
): Promise<{ url: string; contentType: string; body: Uint8Array }> {
	let url = validateUrl(raw);
	const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);

	for (let hop = 0; hop < 5; hop++) {
		const res: Response = await fetch(url, {
			dispatcher: agent,
			redirect: 'manual',
			signal,
			headers: {
				'user-agent': UA,
				accept: opts.accept,
				'accept-language': 'en-GB,en;q=0.9'
			}
		});

		if (res.status >= 300 && res.status < 400) {
			const loc = res.headers.get('location');
			await res.body?.cancel();
			if (!loc) throw new FetchBlockedError('Redirect without location');
			url = validateUrl(new URL(loc, url).toString());
			continue;
		}
		if (!res.ok) {
			await res.body?.cancel();
			throw new Error(`HTTP ${res.status}`);
		}

		const declared = Number(res.headers.get('content-length') ?? 0);
		if (declared > opts.maxBytes) {
			await res.body?.cancel();
			throw new FetchBlockedError('Response too large');
		}

		const chunks: Uint8Array[] = [];
		let total = 0;
		for await (const chunk of res.body ?? []) {
			total += chunk.byteLength;
			if (total > opts.maxBytes) throw new FetchBlockedError('Response too large');
			chunks.push(chunk);
		}
		const body = new Uint8Array(total);
		let off = 0;
		for (const c of chunks) {
			body.set(c, off);
			off += c.byteLength;
		}
		return { url: url.toString(), contentType: res.headers.get('content-type') ?? '', body };
	}
	throw new FetchBlockedError('Too many redirects');
}
