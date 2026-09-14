import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

test.use({ viewport: { width: 1440, height: 900 } });

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(120);
}

async function assertNoHorizontalOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
    };
  });
  expect(overflow.scrollWidth, `${label}: horizontal overflow`).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

async function capture(page, label) {
  await settle(page);
  await assertNoHorizontalOverflow(page, label);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/training-${label}-desktop-1440x900.png`,
    fullPage: false,
    animations: 'disabled',
  });
}

test('Entrenar · captura visual de Escuela, Glosario y Modos especiales', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const train = page.locator('.illustrated-home__destination--train');
  await expect(train).toBeVisible();
  await train.click();

  const shell = page.locator('.tutorial-shell.matthias-school-shell');
  await expect(shell).toBeVisible();
  await expect(shell.locator('.matthias-school-stage')).toBeVisible();
  await capture(page, 'school');

  await shell.getByRole('button', { name: 'Glosario' }).click();
  await expect(shell.locator('.chess-glossary')).toBeVisible();
  await capture(page, 'glossary');

  await shell.getByRole('button', { name: 'Modos especiales' }).click();
  await expect(shell.locator('.mechanic-library')).toBeVisible();
  await capture(page, 'special-modes');
});
