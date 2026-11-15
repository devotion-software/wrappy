import { expect, test } from '@playwright/test';
import { freshEmail, otpFor, signInViaApi, waitForApp } from './helpers';

test.describe('signing in', () => {
	test('a new person signs in with an email code and sets up their profile @mobile', async ({ page }) => {
		const email = freshEmail('new');
		const handle = `e2e${Date.now().toString(36)}`;

		await page.goto('/lists');
		await expect(page).toHaveURL(/\/signin\?next=%2Flists$/);
		await waitForApp(page);

		const sentAfter = new Date(Date.now() - 1000);
		await page.getByLabel('Email').fill(email);
		await page.getByRole('button', { name: 'Email me a code' }).click();
		await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
		await expect(page.getByText(email)).toBeVisible();

		await page.getByLabel('Code').fill(await otpFor(email, sentAfter));
		await page.getByRole('button', { name: 'Log in' }).click();

		await expect(page).toHaveURL(/\/welcome\?next=%2Flists/);
		await page.getByLabel('Your name').fill('Robin Example');
		await page.getByLabel(/^Username/).fill(handle);
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByRole('heading', { name: 'One more thing' })).toBeVisible();
		await page.getByRole('link', { name: 'Skip for now' }).click();

		await expect(page).toHaveURL(/\/lists$/);
		// The profile link now works for anyone.
		const res = await page.request.get(`/u/${handle}`);
		expect(res.status()).toBe(200);
	});

	test('a wrong code is rejected with a helpful message', async ({ page }) => {
		const email = freshEmail('wrong');
		await page.goto('/signin');
		await waitForApp(page);
		await page.getByLabel('Email').fill(email);
		await page.getByRole('button', { name: 'Email me a code' }).click();
		await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
		await page.getByLabel('Code').fill('000000');
		await page.getByRole('button', { name: 'Log in' }).click();
		await expect(page.getByRole('alert')).toContainText('That code is wrong or has expired');
		await expect(page).toHaveURL(/\/signin/);
	});

	test('the code field only accepts six digits', async ({ page }) => {
		await page.goto('/signin');
		await waitForApp(page);
		await page.getByLabel('Email').fill(freshEmail('digits'));
		await page.getByRole('button', { name: 'Email me a code' }).click();
		const code = page.getByLabel('Code');
		await code.fill('12ab34 5678');
		await expect(code).toHaveValue('123456');
	});

	test('a signed-in person is sent from the landing page to their lists', async ({ page, context }) => {
		await signInViaApi(context);
		await page.goto('/');
		await expect(page).toHaveURL(/\/lists$/);
	});

	test('someone without a name is asked for one before using the app', async ({ page, context }) => {
		await signInViaApi(context, { name: '' });
		await page.goto('/items');
		await expect(page).toHaveURL(/\/welcome\?next=%2Fitems/);
	});

	test('sign-in never redirects off-site', async ({ page, context }) => {
		await signInViaApi(context);
		await page.goto('/signin?next=//evil.example/steal');
		await expect(page).toHaveURL(/localhost:\d+\/lists$/);
	});
});
