import { expect, test, type Page } from '@playwright/test';
import { addWishViaUi, createListViaUi, signInViaApi } from './helpers';

/** Set SHOTS=<dir> to save screenshots of each step for a visual check. */
const shot = async (page: Page, name: string) => {
	if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
};

// Playwright dismisses browser pop-ups unless a test handles them, which is what iOS Safari
// can do too. These buttons must work without them: they ask on the page instead.
test('delete an item and a list, confirming on the page', async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
	await signInViaApi(ctx, { name: 'Meg Owner' });
	const page = await ctx.newPage();
	page.on('dialog', () => {
		throw new Error('A browser pop-up was used');
	});
	const listId = await createListViaUi(page, 'Birthday', 'private');
	await addWishViaUi(page, 'Wool scarf');
	await addWishViaUi(page, 'Kite');

	// Cancel keeps the item.
	await page.getByRole('link', { name: 'Edit Wool scarf' }).click();
	await page.getByRole('button', { name: 'Delete this item everywhere' }).click();
	const box = page.getByRole('dialog');
	await expect(box).toContainText('Delete this item from 1 list and everywhere else?');
	await shot(page, 'c1-confirm');
	await box.getByRole('button', { name: 'Cancel' }).click();
	await expect(box).toBeHidden();
	await expect(page).toHaveURL(/\/items\//);

	// Delete goes back to the list, without the item.
	await page.getByRole('button', { name: 'Delete this item everywhere' }).click();
	await box.getByRole('button', { name: 'Delete' }).click();
	await expect(page).toHaveURL(new RegExp(`/lists/${listId}$`));
	await expect(page.getByText('Kite', { exact: true })).toBeVisible();
	await expect(page.getByText('Wool scarf')).toHaveCount(0);

	// Escape cancels too; then delete the list.
	await page.getByRole('button', { name: 'Edit list' }).click();
	await page.getByRole('button', { name: 'Delete this list' }).click();
	await expect(box).toContainText('Delete "Birthday"?');
	await page.keyboard.press('Escape');
	await expect(box).toBeHidden();
	await page.getByRole('button', { name: 'Delete this list' }).click();
	await box.getByRole('button', { name: 'Delete' }).click();
	await expect(page).not.toHaveURL(new RegExp(`/lists/${listId}`));
	await page.goto('/items');
	await expect(page.getByText('Kite', { exact: true })).toBeVisible();
	await ctx.close();
});
