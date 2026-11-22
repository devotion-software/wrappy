import { expect, test, type Page } from '@playwright/test';
import { addWishViaUi, createListViaUi, signInViaApi } from './helpers';

/** Set SHOTS=<dir> to save screenshots of each step for a visual check. */
const shot = async (page: Page, name: string) => {
	if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
};

test('archive an item, undo it, archive again and restore from All my items', async ({ browser }) => {
	const ctx = await browser.newContext();
	await signInViaApi(ctx, { name: 'Meg Owner' });
	const page = await ctx.newPage();
	const listId = await createListViaUi(page, 'Birthday', 'private');
	await addWishViaUi(page, 'Wool scarf');
	await addWishViaUi(page, 'Kite');

	// Archive from the item page: back on the list, it's gone, with an undo.
	await page.getByRole('link', { name: 'Edit Wool scarf' }).click();
	await page.getByRole('button', { name: 'Archive this item' }).click();
	await expect(page).toHaveURL(new RegExp(`/lists/${listId}\\?archived=`));
	await expect(page.getByText('Item archived.')).toBeVisible();
	await expect(page.getByText('Wool scarf')).toHaveCount(0);
	await shot(page, 'a1-list-undo');
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(page.getByText('Wool scarf', { exact: true })).toBeVisible();

	// Archive again, then restore from All my items.
	await page.getByRole('link', { name: 'Edit Wool scarf' }).click();
	await page.getByRole('button', { name: 'Archive this item' }).click();
	await expect(page.getByText('Item archived.')).toBeVisible();
	await page.goto('/items');
	await expect(page.getByText('Archived (1)')).toBeVisible();
	await page.getByText('Archived (1)').click();
	await shot(page, 'a2-library');
	await page.getByRole('button', { name: 'Restore Wool scarf' }).click();
	await expect(page.getByText('Archived (1)')).toHaveCount(0);

	await page.goto(`/lists/${listId}`);
	await expect(page.getByText('Wool scarf', { exact: true })).toBeVisible();
	await ctx.close();
});
