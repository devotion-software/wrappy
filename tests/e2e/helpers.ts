import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

import { BASE_URL, MAILPIT_URL } from './env';

export { BASE_URL, MAILPIT_URL };

/** A fresh address per test, so tests never see each other's emails or accounts. */
export const freshEmail = (who = 'user') => `${who}-${randomBytes(5).toString('hex')}@e2e.test`;

interface MailpitSummary {
	ID: string;
	Subject: string;
	Created: string;
}

/** Wait for the newest email to `to` (optionally newer than `after`) and return its plain text. */
export async function latestEmail(to: string, opts: { subject?: RegExp; after?: Date } = {}): Promise<{ subject: string; text: string }> {
	let found: MailpitSummary | undefined;
	await expect
		.poll(
			async () => {
				const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
				const { messages } = (await res.json()) as { messages: MailpitSummary[] };
				found = messages.find(
					(m) => (!opts.subject || opts.subject.test(m.Subject)) && (!opts.after || new Date(m.Created) >= opts.after)
				);
				return !!found;
			},
			{ timeout: 15_000, message: `no email to ${to}` }
		)
		.toBe(true);
	const msg = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${found!.ID}`)).json()) as { Subject: string; Text: string };
	return { subject: msg.Subject, text: msg.Text };
}

export async function otpFor(email: string, after?: Date): Promise<string> {
	const { text } = await latestEmail(email, { subject: /sign-in code/i, after });
	const code = /\b(\d{6})\b/.exec(text)?.[1];
	if (!code) throw new Error(`No code in email: ${text}`);
	return code;
}

/**
 * Sign a browser context in through the real email-code API (no UI), then set a display name.
 * Cookies land in the context, so pages opened from it are signed in.
 */
export async function signInViaApi(context: BrowserContext, opts: { email?: string; name?: string } = {}) {
	const email = opts.email ?? freshEmail();
	const req: APIRequestContext = context.request;
	const headers = { origin: BASE_URL };
	const started = new Date(Date.now() - 1000);
	const send = await req.post('/api/auth/email-otp/send-verification-otp', { data: { email, type: 'sign-in' }, headers });
	expect(send.ok(), await send.text()).toBeTruthy();
	const otp = await otpFor(email, started);
	const signIn = await req.post('/api/auth/sign-in/email-otp', { data: { email, otp }, headers });
	expect(signIn.ok(), await signIn.text()).toBeTruthy();
	if (opts.name !== '') {
		const name = opts.name ?? `Tester ${email.slice(5, 10)}`;
		const upd = await req.post('/api/auth/update-user', { data: { name }, headers });
		expect(upd.ok(), await upd.text()).toBeTruthy();
	}
	return { email };
}

/** Create a list through the UI and return its id (the page ends on the new list). */
export async function createListViaUi(page: Page, title: string, visibility: 'private' | 'public' = 'private') {
	await page.goto('/lists/new');
	await page.getByLabel('List name').fill(title);
	if (visibility === 'public') await page.locator('input[name="visibility"][value="public"]').check();
	await page.getByRole('button', { name: 'Create list' }).click();
	await expect(page).toHaveURL(/\/lists\/[0-9A-Za-z]{22}$/);
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	return page.url().split('/').pop()!;
}

export async function addWishViaUi(page: Page, wish: string) {
	const input = page.getByLabel('Add a wish');
	await input.fill(wish);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(page.getByText(wish, { exact: true }).first()).toBeVisible();
	await expect(input).toHaveValue('');
}

/** The sign-in form only works once the page's scripts have loaded (it has no no-JS fallback). */
export async function waitForApp(page: Page) {
	await page.waitForLoadState('networkidle');
}
