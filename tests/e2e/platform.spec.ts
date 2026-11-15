import { expect, test } from '@playwright/test';

test.describe('platform', () => {
	test('health check reports the database is reachable', async ({ request }) => {
		const res = await request.get('/healthz');
		expect(res.status()).toBe(200);
		expect(await res.text()).toBe('ok');
		expect(res.headers()['cache-control']).toBe('no-store');
	});

	test('pages are served with security headers and a CSP', async ({ request }) => {
		const res = await request.get('/signin');
		const h = res.headers();
		expect(h['x-content-type-options']).toBe('nosniff');
		expect(h['x-frame-options']).toBe('DENY');
		expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
		expect(h['permissions-policy']).toContain('camera=()');
		const csp = h['content-security-policy'] ?? '';
		expect(csp).toContain("frame-ancestors 'none'");
		expect(csp).toContain("object-src 'none'");
	});

	test('unknown pages, profiles and images 404', async ({ request }) => {
		expect((await request.get('/u/nobody-has-this-name-zz')).status()).toBe(404);
		expect((await request.get('/lists/doesnotexist0000000000')).status()).toBe(404);
		expect((await request.get('/img/../../etc/passwd')).status()).toBe(404);
		expect((await request.get('/s/not-a-real-token')).status()).toBe(404);
	});

	test('the landing page loads for signed-out visitors without console errors @mobile', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
		const res = await page.goto('/');
		expect(res?.status()).toBe(200);
		await expect(page).toHaveTitle(/Wishlist/);
		expect(errors).toEqual([]);
	});
});
