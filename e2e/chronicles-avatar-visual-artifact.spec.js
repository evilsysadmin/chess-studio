import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

const ARTIFACT_DIR = '../.artifacts/app-visual';
const CAPTURES = [
  { label: 'desktop-1440x900', width: 1440, height: 900, hasTouch: false },
  { label: 'android-390x844', width: 390, height: 844, hasTouch: true },
];
const PARTY = [
  { id: 'matthias', name: 'Matthias' },
  { id: 'rook', name: 'Hildegard' },
  { id: 'bishop', name: 'Aziz' },
  { id: 'knight', name: 'Faust' },
];
const CAPTURE_PARTY = process.env.CHRONICLES_AVATAR_SCOPE === 'matthias'
  ? PARTY.filter(({ id }) => id === 'matthias')
  : PARTY;


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
  const pvpLobby = page.getByRole('dialog', { name: 'Duelo 1 contra 1 · War Room', exact: true });
  if (await pvpLobby.isVisible().catch(() => false)) {
    await pvpLobby.getByRole('button', { name: /Cerrar ventana/ }).click();
    await expect(pvpLobby).toBeHidden();
  }
  await openMoreGameModes(page);
  const tools = page.locator('#illustrated-home-tools');
  await expect(tools).toBeVisible();
  await tools.getByRole('button').filter({ hasText: 'Experimentos geniales' }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  const chroniclesEntry = page.locator('.lab-workshop-portal--chronicles');
  await expect(chroniclesEntry).toBeVisible();
  await chroniclesEntry.click();
  // Chronicles now opens its save book before the character creator. The
  // avatar canary must exercise the real New Game entry, not assume play
  // mounts directly when entering from the Dungeon.
  const entry = page.locator('[data-chronicles-save-menu]');
  await expect(entry).toBeVisible({ timeout: 15_000 });
  await entry.getByRole('button', { name: 'Nuevo juego', exact: true }).click();
  await confirmChroniclesCharacterSetup(page);
  await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
  await expect(page.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(1, { timeout: 20_000 });
}

async function captureElement(page, locator, path) {
  // DOM scrolling avoids Playwright's stability wait, which is unreliable on a
  // continuously rendered WebGL surface. boundingBox() is viewport-relative,
  // so do not add window.scrollX/Y a second time when clipping the screenshot.
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
  await page.waitForTimeout(100);
  const box = await locator.boundingBox();
  expect(box, `${path}: capture bounds`).not.toBeNull();
  await page.screenshot({
    path,
    animations: 'disabled',
    timeout: 30_000,
    clip: {
      x: Math.max(0, box.x),
      y: Math.max(0, box.y),
      width: Math.max(1, box.width),
      height: Math.max(1, box.height),
    },
  });
}

for (const capture of CAPTURES) {
  test(`Chronicles · los cuatro retratos authored · ${capture.label}`, async ({ browser }) => {
    // The dungeon remains WebGL, but party identity is now file-backed authored
    // art. Keep enough budget for the dungeon render plus sequential screenshots.
    test.setTimeout(capture.hasTouch ? 150_000 : 210_000);
    await mkdir(ARTIFACT_DIR, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: capture.width, height: capture.height },
      hasTouch: capture.hasTouch,
      isMobile: capture.hasTouch,
    });
    const page = await context.newPage();
    try {
      await openChronicles(page);
      const preview = page.locator('.chronicles-party-preview');
      const portrait = page.locator('[data-chronicles-party-renderer="authored"]');
      if (capture.hasTouch) {
        await expect(preview).toBeHidden();
        await expect(portrait).toBeHidden();
      } else {
        await expect(preview).toBeVisible();
        await expect(portrait).toBeVisible();
      }
      await expect(preview.locator('canvas')).toHaveCount(0);
      await page.locator('.chronicles-stage').evaluate((node) => {
        node.style.display = 'none';
      });

      const rosterThumbnails = page.locator('[data-chronicles-party-thumbnail]');
      await expect(rosterThumbnails).toHaveCount(4);
      const thumbnailIds = await rosterThumbnails.evaluateAll((images) => images.map((image) => (
        image.getAttribute('data-chronicles-party-thumbnail')
      )));
      expect(thumbnailIds, `${capture.label}: canonical roster thumbnail ids`).toEqual(PARTY.map(({ id }) => id));
      const thumbnailsDecoded = await rosterThumbnails.evaluateAll((images) => images.every((image) => (
        image.complete
        && image.naturalWidth >= 128
        && image.naturalHeight >= 128
        && !image.src.startsWith('data:')
      )));
      expect(thumbnailsDecoded, `${capture.label}: authored roster portraits decoded`).toBe(true);

      for (const [index, member] of CAPTURE_PARTY.entries()) {
        const memberButton = page.getByRole('button', { name: `Seleccionar ${member.name}`, exact: true });
        await page.keyboard.press(String(index + 1));
        await expect(memberButton).toHaveAttribute('aria-pressed', 'true');

        if (capture.hasTouch) {
          const thumbnail = memberButton.locator(`[data-chronicles-party-thumbnail="${member.id}"]`);
          await expect(thumbnail).toBeVisible();
          const thumbnailBox = await thumbnail.boundingBox();
          expect(thumbnailBox, `${capture.label}/${member.name}: compact portrait bounds`).not.toBeNull();
          expect(thumbnailBox.width, `${capture.label}/${member.name}: compact portrait width`).toBeGreaterThanOrEqual(32);
          expect(thumbnailBox.height, `${capture.label}/${member.name}: compact portrait height`).toBeGreaterThanOrEqual(32);
          await captureElement(
            page,
            memberButton,
            `${ARTIFACT_DIR}/chronicles-avatar-${member.id}-${capture.label}.png`,
          );
        } else {
          await expect(preview.locator('strong')).toHaveText(member.name);
          await expect(portrait).toHaveAttribute('data-member-id', member.id);
          const portraitBox = await portrait.boundingBox();
          expect(portraitBox, `${capture.label}/${member.name}: portrait bounds`).not.toBeNull();
          expect(portraitBox.width, `${capture.label}/${member.name}: portrait width`).toBeGreaterThan(80);
          expect(portraitBox.height, `${capture.label}/${member.name}: portrait height`).toBeGreaterThan(80);
          await captureElement(
            page,
            preview,
            `${ARTIFACT_DIR}/chronicles-avatar-${member.id}-${capture.label}.png`,
          );
        }
      }
    } finally {
      await context.close();
    }
  });
}
