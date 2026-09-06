import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Modos principales', exact: true })).toBeVisible();
}

async function openExperimentsFromMoreModes(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toHaveCount(1);
  await expect(experiments).toBeHidden();
  await moreModes.locator(':scope > summary').click();
  await expect(moreModes).toHaveAttribute('open', '');
  await expect(experiments).toBeVisible();
  await expect(experiments).toContainText('Pawn Trailblazer');
  return experiments;
}

async function openPawnTrailblazer(page) {
  await openHome(page);
  const experiments = await openExperimentsFromMoreModes(page);
  await experiments.click();
  await page.getByRole('button', { name: /Pawn Trailblazer/ }).click();
  await expect(page.getByRole('heading', { name: 'Pawn Trailblazer', exact: true })).toBeVisible();
}

test('Home desktop · dungeon y archivo revelan profundidad sin devolver el dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const hall = page.locator('.home-castle-life');
  const dungeon = page.locator('details.home-more-modes');
  const dungeonTrigger = dungeon.locator(':scope > summary');
  const archive = page.locator('details.home-learning-more');
  const archiveTrigger = archive.locator(':scope > summary');

  await expect(hall).toBeVisible();
  await expect(dungeonTrigger).toBeVisible();
  await expect(archiveTrigger).toBeVisible();
  await expect(page.locator('.home-modes-section > .home-primary-grid')).toBeHidden();
  await expect(page.locator('.home-next-action')).toBeHidden();

  const resting = await page.evaluate(() => {
    const dungeonSummary = document.querySelector('details.home-more-modes > summary');
    const archiveSummary = document.querySelector('details.home-learning-more > summary');
    const scene = document.querySelector('.home-castle-hub__scene');
    return {
      dungeonTooltipOpacity: dungeonSummary ? Number.parseFloat(getComputedStyle(dungeonSummary, '::after').opacity) : 1,
      archiveTooltipOpacity: archiveSummary ? Number.parseFloat(getComputedStyle(archiveSummary, '::after').opacity) : 1,
      camera: scene?.dataset.homeCastleHubCamera || '',
      dungeonScene: scene?.dataset.homeCastleHubDungeonStair || '',
    };
  });
  expect(resting.dungeonTooltipOpacity).toBeLessThanOrEqual(0.01);
  expect(resting.archiveTooltipOpacity).toBeLessThanOrEqual(0.01);
  expect(resting.camera).toBe('frontal-diorama-v1');
  expect(resting.dungeonScene).toBe('spiral-stone-v1');

  await dungeonTrigger.hover();
  await expect.poll(async () => Number.parseFloat(await dungeonTrigger.evaluate((node) => getComputedStyle(node, '::after').opacity))).toBeGreaterThan(0.9);

  const experiments = await openExperimentsFromMoreModes(page);
  await experiments.click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Ajedrez 3D/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Pawn Trailblazer/ })).toBeVisible();
});

test('Pawn Trailblazer · Three.js gobierna el runner y conserva teclado/controles', async ({ page }) => {
  await openPawnTrailblazer(page);

  const renderer = page.locator('[data-pawn-trailblazer-renderer="three"]');
  await expect(renderer).toBeVisible();
  await expect(renderer.locator('canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar carrera', exact: true })).toBeVisible();
  await expect(page.getByText('Nací peón. Siempre seré peón.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar carrera', exact: true }).click();
  await expect(page.getByText('Iniciar carrera', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Synthmetal', { exact: true })).toBeVisible();
  await expect(page.getByText('Clásica', { exact: true })).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Nein. Un peón no se mueve de lado.', { exact: true })).toBeVisible();
});

test('Home móvil · Experimentos geniales no provoca scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);
  const experiments = await openExperimentsFromMoreModes(page);
  await expect(experiments).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Home móvil · reproductor y usuarios ocupan su propia franja y no pisan la cabecera', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page);

  const dock = page.locator('.global-music-dock');
  const masthead = page.locator('.masthead');
  await expect(dock).toBeVisible();
  await expect(masthead).toBeVisible();

  const [dockBox, mastheadBox] = await Promise.all([dock.boundingBox(), masthead.boundingBox()]);
  expect(dockBox).not.toBeNull();
  expect(mastheadBox).not.toBeNull();
  expect(dockBox.y + dockBox.height).toBeLessThanOrEqual(mastheadBox.y + 1);

  const status = dock.locator('.live-service-status');
  if (await status.isVisible().catch(() => false)) {
    const statusBox = await status.boundingBox();
    expect(statusBox).not.toBeNull();
    expect(statusBox.y).toBeGreaterThanOrEqual(dockBox.y);
    expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(dockBox.y + dockBox.height + 1);
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Pawn Trailblazer móvil · HUD compacto, controles táctiles y dock global no se pisan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openPawnTrailblazer(page);

  const renderer = page.locator('[data-pawn-trailblazer-renderer="three"]');
  await expect(renderer).toBeVisible();
  await expect(renderer.locator('canvas')).toBeVisible();

  const hud = page.locator('.pawn-trailblazer-hud');
  const formCard = hud.locator(':scope > span').last();
  const stagePower = page.locator('.pawn-trailblazer-stage-power');
  await expect(hud).toBeVisible();
  await expect(formCard).toBeHidden();
  await expect(stagePower).toBeVisible();
  await expect(stagePower).toContainText('PEÓN');

  const hudBox = await hud.boundingBox();
  expect(hudBox).not.toBeNull();

  const status = page.locator('.global-music-dock .live-service-status');
  if (await status.isVisible().catch(() => false)) {
    const statusBox = await status.boundingBox();
    expect(statusBox).not.toBeNull();
    const overlapsHud = !(
      statusBox.x + statusBox.width <= hudBox.x
      || hudBox.x + hudBox.width <= statusBox.x
      || statusBox.y + statusBox.height <= hudBox.y
      || hudBox.y + hudBox.height <= statusBox.y
    );
    expect(overlapsHud).toBe(false);
    expect(statusBox.width).toBeLessThan(200);

    const retroPlayer = page.locator('.global-music-dock .music-deck').first();
    if (await retroPlayer.isVisible().catch(() => false)) {
      const retroBox = await retroPlayer.boundingBox();
      expect(retroBox).not.toBeNull();
      const overlapsRetroPlayer = !(
        statusBox.x + statusBox.width <= retroBox.x
        || retroBox.x + retroBox.width <= statusBox.x
        || statusBox.y + statusBox.height <= retroBox.y
        || retroBox.y + retroBox.height <= statusBox.y
      );
      expect(overlapsRetroPlayer).toBe(false);
      expect(statusBox.y).toBeGreaterThanOrEqual(retroBox.y + retroBox.height + 4);
    }
  }

  await page.getByRole('button', { name: 'Iniciar carrera', exact: true }).click();
  const touchControls = page.getByLabel('Controles táctiles');
  const left = page.getByRole('button', { name: 'Mover o capturar a la izquierda', exact: true });
  const action = page.getByRole('button', { name: 'Acción', exact: true });
  const right = page.getByRole('button', { name: 'Mover o capturar a la derecha', exact: true });
  await expect(touchControls).toBeVisible();
  await expect(left).toBeVisible();
  await expect(action).toBeVisible();
  await expect(right).toBeVisible();

  for (const control of [left, action, right]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(56);
  }

  await left.click();
  await expect(page.getByText('Nein. Un peón no se mueve de lado.', { exact: true })).toBeVisible();

  const stage = page.locator('.pawn-trailblazer-stage');
  const [stageBox, powerBox, touchBox] = await Promise.all([
    stage.boundingBox(),
    stagePower.boundingBox(),
    touchControls.boundingBox(),
  ]);
  expect(stageBox).not.toBeNull();
  expect(powerBox).not.toBeNull();
  expect(touchBox).not.toBeNull();
  expect(stageBox.height).toBeGreaterThanOrEqual(500);
  expect(powerBox.y + powerBox.height).toBeLessThan(touchBox.y);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
