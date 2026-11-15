import { expect, test, type Browser } from '@playwright/test';
import { addWishViaUi, createListViaUi, signInViaApi } from './helpers';

/** Owner makes a list with a secret link; returns the link and the owner's page. */
async function listWithLink(browser: Browser, wishes: string[]) {
	const ctx = await browser.newContext();
	await signInViaApi(ctx, { name: 'Olive Owner' });
	const page = await ctx.newPage();
	const id = await createListViaUi(page, `Christmas ${Date.now()}`);
	for (const w of wishes) await addWishViaUi(page, w);
	await page.getByRole('button', { name: 'Create a secret link' }).click();
	const link = await page.getByLabel('Secret link').inputValue();
	expect(link).toMatch(/\/s\/[0-9A-Za-z]{40}$/);
	return { ctx, page, id, link };
}

async function guest(browser: Browser, name: string) {
	const ctx = await browser.newContext();
	await signInViaApi(ctx, { name });
	return { ctx, page: await ctx.newPage() };
}

const row = (page: import('@playwright/test').Page, title: string) =>
	page.locator('.row').filter({ has: page.getByText(title, { exact: true }) });

test.describe('claiming gifts without spoiling the surprise', () => {
	test('a guest reserves then buys a wish; the owner never finds out', async ({ browser }) => {
		const owner = await listWithLink(browser, ['Teapot', 'Slippers']);
		const sam = await guest(browser, 'Sam Giver');

		await sam.page.goto(owner.link);
		await expect(sam.page).toHaveURL(new RegExp(`/lists/${owner.id}$`));
		await expect(sam.page.getByText("Olive can't see what you reserve or buy.")).toBeVisible();

		await row(sam.page, 'Teapot').getByRole('button', { name: "I'll get it" }).click();
		await expect(row(sam.page, 'Teapot').getByText("you're getting this")).toBeVisible();
		await row(sam.page, 'Teapot').getByRole('button', { name: 'Mark as bought' }).click();
		await expect(row(sam.page, 'Teapot').getByRole('button', { name: 'Mark as bought' })).toHaveCount(0);

		// The owner sees nothing about it, even after reloading.
		await owner.page.reload();
		await expect(row(owner.page, 'Teapot')).toBeVisible();
		await expect(owner.page.getByText(/reserved|bought by|you're getting this/)).toHaveCount(0);
		// Nor does the data sent to their browser (they can still see that Sam opened the list).
		const html = await (await owner.ctx.request.get(`/lists/${owner.id}`)).text();
		expect(html).toMatch(/title:"Teapot"[^}]*claim:null/);
		expect(html).not.toMatch(/status:"(buying|bought)"/);

		// Another guest who came through the same link sees it's taken, and by whom.
		const priya = await guest(browser, 'Priya Friend');
		await priya.page.goto(owner.link);
		await expect(row(priya.page, 'Teapot').getByText('bought by Sam Giver')).toBeVisible();
		await expect(row(priya.page, 'Teapot').getByRole('button', { name: "I'll get it" })).toHaveCount(0);
		await expect(row(priya.page, 'Slippers').getByRole('button', { name: "I'll get it" })).toBeVisible();

		for (const c of [owner.ctx, sam.ctx, priya.ctx]) await c.close();
	});

	test('a guest can undo a reservation', async ({ browser }) => {
		const owner = await listWithLink(browser, ['Kite']);
		const sam = await guest(browser, 'Sam Undo');
		await sam.page.goto(owner.link);
		await row(sam.page, 'Kite').getByRole('button', { name: "I'll get it" }).click();
		await expect(row(sam.page, 'Kite').getByText("you're getting this")).toBeVisible();
		await row(sam.page, 'Kite').getByRole('button', { name: 'Undo' }).click();
		await expect(row(sam.page, 'Kite').getByRole('button', { name: "I'll get it" })).toBeVisible();
		await owner.ctx.close();
		await sam.ctx.close();
	});

	test('making a new secret link locks out people who used the old one', async ({ browser }) => {
		const owner = await listWithLink(browser, ['Mug']);
		const sam = await guest(browser, 'Sam Locked');
		await sam.page.goto(owner.link);
		await expect(sam.page.getByText('Mug')).toBeVisible();

		await owner.page.getByRole('button', { name: 'Make a new link' }).click();
		await expect(owner.page.getByLabel('Secret link')).not.toHaveValue(owner.link);

		expect((await sam.ctx.request.get(owner.link, { maxRedirects: 0 })).status()).toBe(404);
		expect((await sam.ctx.request.get(`/lists/${owner.id}`)).status()).toBe(404);
		await owner.ctx.close();
		await sam.ctx.close();
	});

	test('turning the link off shows a clear message to anyone using it', async ({ browser }) => {
		const owner = await listWithLink(browser, ['Socks']);
		await owner.page.getByRole('button', { name: 'Turn off link' }).click();
		await expect(owner.page.getByRole('button', { name: 'Create a secret link' })).toBeVisible();

		const anon = await browser.newContext();
		const page = await anon.newPage();
		const res = await page.goto(owner.link);
		expect(res?.status()).toBe(404);
		await expect(page.getByText('This link has been turned off')).toBeVisible();
		await anon.close();
		await owner.ctx.close();
	});
});
