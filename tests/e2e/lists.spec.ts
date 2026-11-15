import { expect, test } from '@playwright/test';
import { addWishViaUi, createListViaUi, freshEmail, latestEmail, signInViaApi } from './helpers';

test.describe('wish lists', () => {
	test('the owner builds a list, and it shows on their lists page', async ({ page, context }) => {
		await signInViaApi(context);
		const title = `Birthday ${Date.now()}`;
		await createListViaUi(page, title);
		await addWishViaUi(page, 'Hand-knitted scarf');
		await addWishViaUi(page, 'Film camera');
		await expect(page.getByText('2 wishes')).toBeVisible();

		await page.goto('/lists');
		await expect(page.getByText(title)).toBeVisible();

		// Every wish also lands in the owner's library.
		await page.goto('/items');
		await expect(page.getByText('Hand-knitted scarf')).toBeVisible();
		await expect(page.getByText('Film camera')).toBeVisible();
	});

	test('a private list is invisible to strangers and signed-out visitors', async ({ page, context, browser }) => {
		await signInViaApi(context);
		const id = await createListViaUi(page, `Private ${Date.now()}`);

		const anon = await browser.newContext();
		const res = await anon.request.get(`/lists/${id}`);
		expect(res.status()).toBe(404);

		const strangerCtx = await browser.newContext();
		await signInViaApi(strangerCtx);
		expect((await strangerCtx.request.get(`/lists/${id}`)).status()).toBe(404);
		await anon.close();
		await strangerCtx.close();
	});

	test('a public list can be read without signing in, but claiming asks you to sign in', async ({ page, context, browser }) => {
		await signInViaApi(context);
		const title = `Public ${Date.now()}`;
		const id = await createListViaUi(page, title, 'public');
		await addWishViaUi(page, 'Board game');

		const anon = await browser.newContext();
		const guest = await anon.newPage();
		await guest.goto(`/lists/${id}`);
		await expect(guest.getByRole('heading', { level: 1, name: title })).toBeVisible();
		await expect(guest.getByText('Board game')).toBeVisible();
		await guest.getByRole('link', { name: "I'll get it" }).click();
		await expect(guest).toHaveURL(new RegExp(`/signin\\?next=${encodeURIComponent(`/lists/${id}`)}`));
		await anon.close();
	});

	test('inviting someone by email sends them a link to the list', async ({ page, context }) => {
		await signInViaApi(context, { name: 'Alex Owner' });
		const title = `Invite ${Date.now()}`;
		await createListViaUi(page, title);
		const friend = freshEmail('friend');
		await page.getByLabel('Invite by email').fill(friend);
		await page.getByRole('button', { name: 'Invite' }).click();
		await expect(page.getByText(friend)).toBeVisible();

		const mail = await latestEmail(friend, { subject: /shared a wish list/ });
		expect(mail.subject).toBe('Alex Owner shared a wish list with you');
		expect(mail.text).toContain(title);
	});
});
