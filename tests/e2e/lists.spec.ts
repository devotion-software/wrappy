import { expect, test } from '@playwright/test';
import { addWishViaUi, createListViaUi, freshEmail, latestEmail, signInViaApi, waitForApp } from './helpers';

test.describe('wish lists', () => {
	test('the owner builds a list, and it shows on their lists page', async ({ page, context }) => {
		await signInViaApi(context);
		const title = `Birthday ${Date.now()}`;
		await createListViaUi(page, title);
		await addWishViaUi(page, 'Hand-knitted scarf');
		await addWishViaUi(page, 'Film camera');
		await expect(page.getByText('2 items')).toBeVisible();
		// Enter adds it and leaves you in the input, ready for the next one.
		await waitForApp(page);
		const input = page.getByLabel('Add an item');
		await input.fill('Woolly hat');
		await input.press('Enter');
		await expect(page.getByText('Woolly hat', { exact: true })).toBeVisible();
		await expect(input).toHaveValue('');
		await expect(input).toBeFocused();

		await page.goto('/lists');
		await expect(page.getByText(title)).toBeVisible();

		// Every wish also lands in the owner's library.
		await page.goto('/items');
		await expect(page.getByText('Hand-knitted scarf')).toBeVisible();
		await expect(page.getByText('Film camera')).toBeVisible();
	});

	test('pasting a whole list into the add input previews it, then adds every item', async ({ page, context }) => {
		await signInViaApi(context);
		await createListViaUi(page, `Paste ${Date.now()}`);
		await expect(page.getByRole('button', { name: 'Paste a list' })).toHaveCount(0);

		await waitForApp(page);
		const input = page.getByLabel('Add an item');
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await page.evaluate(() => navigator.clipboard.writeText('- [ ] Cosy socks\n- [ ] A good book £12\n- [ ] Tea'));
		await input.focus();
		await page.keyboard.press('ControlOrMeta+V');
		await expect(input).toHaveValue('');
		await expect(page.getByText('3 items found')).toBeVisible();
		await page.getByRole('button', { name: 'Add 3 items' }).click();
		await expect(page.getByText(/Added 3 items to Paste/)).toBeVisible();
		for (const t of ['Cosy socks', 'A good book', 'Tea']) await expect(page.getByText(t, { exact: true }).first()).toBeVisible();
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
