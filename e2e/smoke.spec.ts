import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('work the queue, add a person, pipeline and activity', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Stay in touch');
  await expect(page.locator('.hero .q-row').first()).toBeVisible();
  await page.waitForTimeout(900);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'See who’s due' }).click();
  const row = page.locator('li', { hasText: 'Tom Okoye' }).first();
  await row.getByRole('button', { name: 'Log interaction' }).click();
  await row.getByLabel('What happened').fill('Quote accepted — kickoff next week.');
  await row.getByLabel('Next step').fill('Send contract');
  await row.getByRole('button', { name: 'Save interaction' }).click();
  await snap(page, 'today');
  await checkMobile(page);
  await page.reload();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' }).click();
  await page.getByRole('link', { name: 'Tom Okoye' }).click();
  await expect(page.getByText('Quote accepted — kickoff next week.')).toBeVisible();
  await snap(page, 'person');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'People' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Alex Romero');
  await page.getByLabel('Company').fill('Demo Ventures');
  await page.getByRole('button', { name: 'Add person' }).click();
  await expect(page.getByRole('heading', { name: 'Alex Romero' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pipeline' }).click();
  await page.getByRole('button', { name: 'Move Alex Romero to Reached out' }).click();
  await snap(page, 'pipeline');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Activity' }).click();
  await page.waitForTimeout(900);
  await snap(page, 'activity');
  await checkMobile(page, 'activity-mobile');
});
