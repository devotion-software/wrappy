const BASE = 'https://wrappy.invalid';

/** Only allow same-origin relative paths as post-sign-in destinations (no open redirects). */
export function safeRedirect(target: string | null | undefined, fallback = '/lists'): string {
	if (!target || !target.startsWith('/') || target.startsWith('//')) return fallback;
	// Browsers strip tabs/newlines and treat backslashes as slashes, so "/\t/evil.com" or "/\evil.com"
	// would leave the site. Reject them outright rather than trying to normalise.
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f\\]/.test(target)) return fallback;
	let u: URL;
	try {
		u = new URL(target, BASE);
	} catch {
		return fallback;
	}
	if (u.origin !== BASE) return fallback;
	return u.pathname + u.search + u.hash;
}
