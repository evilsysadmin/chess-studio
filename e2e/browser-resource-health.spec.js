import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(300);
}

async function resourceSnapshot(page) {
  return page.evaluate(() => performance.getEntriesByType('resource')
    .filter((entry) => ['script', 'link'].includes(entry.initiatorType) || /\.(?:js|css)(?:\?|$)/.test(entry.name))
    .map((entry) => ({
      url:entry.name,
      initiatorType:entry.initiatorType,
      transferSize:Number(entry.transferSize || 0),
      encodedBodySize:Number(entry.encodedBodySize || 0),
      decodedBodySize:Number(entry.decodedBodySize || 0),
      durationMs:Math.round(Number(entry.duration || 0) * 10) / 10,
    }))
    .sort((left, right) => left.url.localeCompare(right.url)));
}

function summarize(resources) {
  return {
    count:resources.length,
    transferBytes:resources.reduce((sum, entry) => sum + entry.transferSize, 0),
    encodedBytes:resources.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
    decodedBytes:resources.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
  };
}

test('Browser resources · separa shell/Home de chunks lazy de Así juegas', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive:true });
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await page.route('http://localhost:4000/api/client-telemetry', (route) => route.fulfill({ status:204, body:'' }));
  await login(page);

  const home = page.getByRole('region', { name:'Modos principales' });
  const homeStage = home.locator('.illustrated-home__stage');
  const matthias = home.getByRole('button', { name:'Abrir Así juegas con Matthias', exact:true });
  await expect(homeStage).toBeVisible();
  await settle(page);

  const homeResources = await resourceSnapshot(page);
  const homeUrls = new Set(homeResources.map((entry) => entry.url));

  await matthias.click();
  await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
  await settle(page);

  const insightsResources = await resourceSnapshot(page);
  const lazyResources = insightsResources.filter((entry) => !homeUrls.has(entry.url));

  const report = {
    schema:1,
    home:{ summary:summarize(homeResources), resources:homeResources },
    afterInsights:{ summary:summarize(insightsResources), resources:insightsResources },
    insightsLazy:{ summary:summarize(lazyResources), resources:lazyResources },
  };
  await writeFile(
    `${ARTIFACT_DIR}/browser-resource-health.json`,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );

  expect(homeResources.length).toBeGreaterThan(0);
  expect(insightsResources.length).toBeGreaterThanOrEqual(homeResources.length);
});
