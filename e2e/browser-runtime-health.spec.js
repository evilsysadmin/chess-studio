import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

function attachRuntimeErrorProbe(page) {
  const faults = [];
  const httpErrors = [];

  page.on('pageerror', (error) => {
    faults.push({ type:'pageerror', message:String(error?.stack || error?.message || error) });
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    faults.push({
      type:'console.error',
      message:message.text(),
      url:location?.url || null,
      lineNumber:location?.lineNumber ?? null,
      columnNumber:location?.columnNumber ?? null,
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;
    httpErrors.push({ status:response.status(), url:response.url() });
  });

  return { faults, httpErrors };
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

test('Browser runtime · Home y Así juegas no dejan errores silenciosos', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive:true });
  const { faults, httpErrors } = attachRuntimeErrorProbe(page);
  const stages = [];

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
  stages.push({ name:'home', faultCount:faults.length, httpErrorCount:httpErrors.length });

  const matthias = home.getByRole('button', { name:'Abrir Así juegas con Matthias', exact:true });
  await expect(matthias).toBeVisible();
  await matthias.click();
  await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
  await settle(page);
  stages.push({ name:'asi-juegas', faultCount:faults.length, httpErrorCount:httpErrors.length });

  await writeFile(
    `${ARTIFACT_DIR}/browser-runtime-health.json`,
    `${JSON.stringify({ schema:2, stages, faults, httpErrors }, null, 2)}\n`,
    'utf8',
  );

  const diagnostic = [
    ...faults.map((fault) => `[${fault.type}] ${fault.message}${fault.url ? ` @ ${fault.url}` : ''}`),
    ...httpErrors.map((fault) => `[http ${fault.status}] ${fault.url}`),
  ].join('\n\n');
  expect(faults, diagnostic).toEqual([]);
});
