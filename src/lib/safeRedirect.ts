/** Only allow same-origin relative paths as post-sign-in destinations (no open redirects). */
export function safeRedirect(target: string | null | undefined, fallback = '/lists'): string {
	if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	return target;
}
