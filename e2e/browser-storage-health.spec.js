import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { login, mockApi } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
}

async function installStorageProbe(page) {
  await page.addInitScript(() => {
    const events = [];
    const nativeGetItem = Storage.prototype.getItem;
    const nativeSetItem = Storage.prototype.setItem;
    const nativeRemoveItem = Storage.prototype.removeItem;

    function storageName(target) {
      try {
        if (target === window.localStorage) return 'localStorage';
        if (target === window.sessionStorage) return 'sessionStorage';
      } catch {
        return 'unknownStorage';
      }
      return 'otherStorage';
    }

    Storage.prototype.setItem = function(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      let previous = null;
      let readable = true;
      try {
        previous = nativeGetItem.call(this, normalizedKey);
      } catch {
        readable = false;
      }
      events.push({
        storage:storageName(this),
        op:'set',
        key:normalizedKey,
        redundant:readable && previous === normalizedValue,
      });
      return nativeSetItem.call(this, normalizedKey, normalizedValue);
    };

    Storage.prototype.removeItem = function(key) {
      const normalizedKey = String(key);
      let previous = null;
      let readable = true;
      try {
        previous = nativeGetItem.call(this, normalizedKey);
      } catch {
        readable = false;
      }
      events.push({
        storage:storageName(this),
        op:'remove',
        key:normalizedKey,
        redundant:readable && previous === null,
      });
      return nativeRemoveItem.call(this, normalizedKey);
    };

    window.__chessStorageProbe = {
      reset() { events.length = 0; },
      snapshot() { return events.slice(); },
    };
  });
}

function summarize(events = []) {
  const counts = new Map();
  for (const event of events) {
    const key = `${event.storage}:${event.op}:${event.key}:${event.redundant ? 'redundant' : 'changed'}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

test('Browser storage · inventaría escrituras redundantes en navegación estable', async ({ page }) => {
  await mkdir(ARTIFACT_DIR, { recursive:true });
  await installStorageProbe(page);
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

  const reset = () => page.evaluate(() => window.__chessStorageProbe.reset());
  const snapshot = () => page.evaluate(() => window.__chessStorageProbe.snapshot());

  await reset();
  await page.waitForTimeout(600);
  const idleHome = await snapshot();

  await reset();
  await matthias.click();
  await expect(page.getByRole('heading', { name:'Así juegas', exact:true })).toBeVisible();
  await settle(page);
  const openInsights = await snapshot();

  await reset();
  await page.keyboard.press('Escape');
  await expect(homeStage).toBeVisible();
  await settle(page);
  const backHome = await snapshot();

  const stages = [
    { name:'home-idle', events:idleHome },
    { name:'home→insights', events:openInsights },
    { name:'insights→home', events:backHome },
  ].map((stage) => ({
    ...stage,
    summary:summarize(stage.events),
    redundant:stage.events.filter((event) => event.redundant),
  }));

  await writeFile(
    `${ARTIFACT_DIR}/browser-storage-health.json`,
    `${JSON.stringify({ schema:1, stages }, null, 2)}\n`,
    'utf8',
  );

  expect(stages).toHaveLength(3);
});
