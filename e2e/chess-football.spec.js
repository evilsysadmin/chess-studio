import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const RELEASE = '0123456789abcdef';
const INDEX_URL = `https://assets.chess-studio.shadowops.dpdns.org/chess-football-godot/releases/${RELEASE}/index.html`;

async function openExperiments(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await page.route('**/chess-football-godot/current.json**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      version: 1,
      release: RELEASE,
      sourceSha: 'a'.repeat(40),
      index: INDEX_URL,
    }),
  }));
  await page.route(INDEX_URL, (route) => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main>Chess Football mock runtime</main></body></html>',
  }));

  await login(page);
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

test('Chess Football opens through the experiments hub and returns cleanly', async ({ page }) => {
  await openExperiments(page);

  await page.locator('.lab-workshop-portal--football').click();

  const host = page.locator('.chess-football-godot-host');
  await expect(host).toBeVisible();
  const frame = page.locator('iframe[title="Chess Football Godot"]');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', INDEX_URL);
  await expect(host).toHaveAttribute('data-runtime-ready', 'true');

  await page.getByRole('button', { name: 'Volver a Experimentos' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(host).toHaveCount(0);
});
