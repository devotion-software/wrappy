import { expect, test } from '@playwright/test';
import { createListViaUi, signInViaApi } from './helpers';

test('make a group, join it by link, and share a list with everyone in it', async ({ browser }) => {
	const megCtx = await browser.newContext();
	const samCtx = await browser.newContext();
	await signInViaApi(megCtx, { name: 'Meg Owner' });
	await signInViaApi(samCtx, { name: 'Sam Guest' });
	const meg = await megCtx.newPage();
	const sam = await samCtx.newPage();

	await meg.goto('/friends');
	await meg.getByLabel('New group').fill('Family');
	await meg.getByRole('button', { name: 'Create group' }).click();
	await expect(meg).toHaveURL(/\/groups\//);
	const link = await meg.getByLabel('Join link').inputValue();

	await sam.goto(link);
	await expect(sam.getByText('Meg Owner invited you to')).toBeVisible();
	await sam.getByRole('button', { name: 'Join the group' }).click();
	await expect(sam).toHaveURL(/\/groups\//);
	await expect(sam.getByText('Sam Guest (you)')).toBeVisible();

	const listId = await createListViaUi(meg, 'Birthday', 'private');
	await meg.getByLabel('Share with a group').selectOption({ index: 0 });
	await meg.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(meg.getByText('Invited 1 more person.')).toBeVisible();
	await expect(meg.getByText('from Family')).toBeVisible();

	await sam.goto(`/lists/${listId}`);
	await expect(sam.getByRole('heading', { name: 'Birthday' })).toBeVisible();

	await megCtx.close();
	await samCtx.close();
});
