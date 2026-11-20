import { expect, test, type Page } from '@playwright/test';
import { addWishViaUi, createListViaUi, signInViaApi } from './helpers';

/** Set SHOTS=<dir> to save screenshots of each step for a visual check. */
const shot = async (page: Page, name: string) => {
	if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png`, fullPage: true });
};

test.describe('occasions and presents off the list', () => {
	test('a guest gets something for Christmas and notes an extra; opening the birthday spoils nothing', async ({ browser }) => {
		const ownerCtx = await browser.newContext();
		const guestCtx = await browser.newContext();
		await signInViaApi(ownerCtx, { name: 'Meg Owner' });
		await signInViaApi(guestCtx, { name: 'Sam Guest' });
		const owner = await ownerCtx.newPage();
		const guest = await guestCtx.newPage();

		const listId = await createListViaUi(owner, 'Birthday and Christmas', 'public');
		await addWishViaUi(owner, 'Wool scarf');
		for (const [name, date] of [
			['Birthday', '2099-12-12'],
			['Christmas', '2099-12-25']
		]) {
			await owner.getByLabel('Occasion', { exact: true }).fill(name);
			await owner.getByLabel('Date', { exact: true }).fill(date);
			await owner.getByRole('button', { name: 'Add occasion' }).click();
			await expect(owner.getByText(name, { exact: true }).first()).toBeVisible();
		}
		await shot(owner, '1-owner-occasions');

		// The guest says the scarf is for Christmas, and notes gloves they bought that aren't on the list.
		await guest.goto(`/lists/${listId}`);
		await guest.getByLabel('Which occasion is it for?').first().selectOption({ label: 'for Christmas' });
		await guest.getByRole('button', { name: "I'll get it" }).click();
		await expect(guest.getByText("you're getting this")).toBeVisible();
		await guest.getByRole('button', { name: 'Mark as bought' }).click();
		await expect(guest.getByText('bought by you')).toBeVisible();
		await guest.getByLabel(/Something you got .* that isn't on the list/).fill('Matching gloves');
		await guest.locator('#extra-occ').selectOption({ label: 'for Birthday' });
		await guest.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(guest.getByText('Matching gloves')).toBeVisible();
		await expect(guest.getByText('from you · for Birthday')).toBeVisible();
		await shot(guest, '2-guest-view');

		// The owner sees neither.
		await owner.reload();
		await expect(owner.getByText('Matching gloves')).toHaveCount(0);
		await expect(owner.getByText(/bought by/)).toHaveCount(0);

		// Opening the birthday shows the gloves in Presents received, but not the Christmas scarf.
		owner.once('dialog', (d) => d.accept());
		await owner.getByRole('button', { name: 'Opened them' }).first().click();
		await expect(owner.getByText('opened', { exact: true })).toBeVisible();
		await expect(owner.getByText(/bought by/)).toHaveCount(0);
		await owner.goto('/gifts');
		await expect(owner.getByText(/got you Matching gloves/)).toBeVisible();
		await expect(owner.getByText(/Wool scarf/)).toHaveCount(0);
		await shot(owner, '3-owner-gifts');

		await ownerCtx.close();
		await guestCtx.close();
	});
});
