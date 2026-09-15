import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const PARTY = [
  { id: 'matthias', name: 'Matthias' },
  { id: 'hildegard', name: 'Hildegard' },
  { id: 'aziz', name: 'Aziz' },
  { id: 'morcilla', name: 'Morcilla' },
];

async function openChronicles(page) {
  await mockApi(page, {
    profileSeed: {
      'matthias.onboarded': '2',
      'chess-study-home-guide-dismissed-v1': '1',
    },
  });
  await login(page);
  const speech = page.getByRole('region', { name: 'Mensaje de Matthias', exact: true });
  if (await speech.isVisible().catch(() => false)) {
    const close = speech.getByRole('button', { name: 'Cerrar comentario de Matthias', exact: true });
    if (await close.isVisible().catch(() => false)) await close.click({ force: true });
  }
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Chronicles of Matthias/ }).click();
  await expect(page.getByRole('heading', { name: 'Chronicles of Matthias', exact: true })).toBeVisible();
  await expect(page.locator('[data-chronicles-party-renderer="three"] canvas')).toHaveCount(1, { timeout: 20_000 });
}

test('Chronicles · los cuatro avatares 3D quedan fotografiados en desktop y Android', async ({ browser }) => {
  // Software WebGL on hosted runners needs room for 8 deterministic portrait renders.
  // Screenshot/action budgets stay strict; only this visual proof gets the wider wall clock.
  test.setTimeout(240_000);
  await mkdir(ARTIFACT_DIR, { recursive: true });

  for (const capture of CAPTURES) {
    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page);
      const preview = page.locator('.chronicles-party-preview');
      const portraitCanvas = page.locator('[data-chronicles-party-renderer="three"] canvas');
      await expect(preview).toBeVisible();
      await expect(portraitCanvas).toBeVisible();

      for (const member of PARTY) {
        await page.getByRole('button', { name: `Seleccionar ${member.name}`, exact: true }).click();
        await expect(preview.locator('strong')).toHaveText(member.name);
        await page.waitForTimeout(100);
        const canvasBox = await portraitCanvas.boundingBox();
        expect(canvasBox, `${capture.label}/${member.name}: canvas bounds`).not.toBeNull();
        expect(canvasBox.width, `${capture.label}/${member.name}: canvas width`).toBeGreaterThan(80);
        expect(canvasBox.height, `${capture.label}/${member.name}: canvas height`).toBeGreaterThan(80);
        await preview.screenshot({
          path: `${ARTIFACT_DIR}/chronicles-avatar-${member.id}-${capture.label}.png`,
          animations: 'disabled',
          timeout: 12_000,
        });
      }
    } finally {
      await context.close();
    }
  }
});
