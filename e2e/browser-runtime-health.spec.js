import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

function attachRuntimeErrorProbe(page) {
  const faults = [];

  page.on('pageerror', (error) => {
    faults.push({ type:'pageerror', message:String(error?.stack || error?.message || error) });
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    faults.push({ type:'console.error', message:message.text() });
  });

  return faults;
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

test('Browser runtime · Home y Así juegas no dejan errores silenciosos', async ({ page }) => {
  const faults = attachRuntimeErrorProbe(page);

  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);

  const home = page.getByRole('region', { name:'Modos principales' });
  await expect(home).toBeVisible();
  await expect(home.locator('.illustrated-home__stage')).toBeVisible();
  await settle(page);

  const matthias = home.getByRole('button', { name:'Abrir Así juegas con Matthias', exact:true });
  await expect(matthias).toBeVisible();
  await matthias.click();
  await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
  await settle(page);

  expect(faults, faults.map((fault) => `[${fault.type}] ${fault.message}`).join('\n\n')).toEqual([]);
});
