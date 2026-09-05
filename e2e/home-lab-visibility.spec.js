import { expect, test } from '@playwright/test';
import { login, mockApi } from './helpers.js';

async function openHome(page) {
  await mockApi(page);
  await login(page);
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (await guide.isVisible().catch(() => false)) {
    await guide.getByRole('button', { name: 'Ahora no', exact: true }).click();
  }
  await expect(page.getByRole('region', { name: 'Hoy en Chess Studio' })).toBeVisible();
}

async function openExperimentsFromMoreModes(page) {
  const moreModes = page.locator('details.home-more-modes');
  await expect(moreModes).not.toHaveAttribute('open', '');

  const experiments = moreModes
    .locator('.friendly-disclosure-body > .menu-card-shell > button')
    .filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toHaveCount(1);
  await expect(experiments).toBeHidden();
  await moreModes.getByText('Más modos de juego', { exact: true }).click();
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

test('Home · aprendizaje secundario se revela bajo demanda y Experimentos geniales abre el hangar', async ({ page }) => {
  await page.setViewportSize({ width: 1552, height: 900 });
  await openHome(page);

  const commandContract = await page.locator('.home-modes-section').evaluate((section) => {
    const menu = section.closest('.menu.home-friendly');
    const heading = section.querySelector('.home-group-heading');
    const title = heading?.querySelector('h2');
    const actions = heading?.querySelector('.home-heading-actions');
    const description = actions?.querySelector('p');
    const guide = actions?.querySelector('.home-context-guide');
    const grid = section.querySelector('.home-primary-grid');
    const primaryCards = [...section.querySelectorAll('.home-primary-grid .home-mode-card')];
    const menuRect = menu?.getBoundingClientRect();
    const headingRect = heading?.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const gridRect = grid?.getBoundingClientRect();
    const descriptionRect = description?.getBoundingClientRect();
    const guideRect = guide?.getBoundingClientRect();
    const pseudoStyle = title ? getComputedStyle(title, '::after') : null;
    const lineHeight = pseudoStyle ? Number.parseFloat(pseudoStyle.lineHeight) : 0;
    const fontSize = pseudoStyle ? Number.parseFloat(pseudoStyle.fontSize) : 0;
    const titleLines = titleRect && lineHeight > 0 ? titleRect.height / lineHeight : 0;

    return {
      menuViewportRatio: menuRect ? menuRect.width / window.innerWidth : 0,
      gridMenuRatio: menuRect && gridRect ? gridRect.width / menuRect.width : 0,
      minimumPrimaryCardHeight: primaryCards.length
        ? Math.min(...primaryCards.map((card) => card.getBoundingClientRect().height))
        : 0,
      menuBorderLeftWidth: menu ? Number.parseFloat(getComputedStyle(menu).borderLeftWidth) : 999,
      menuBorderRightWidth: menu ? Number.parseFloat(getComputedStyle(menu).borderRightWidth) : 999,
      headingHeight: headingRect?.height || 0,
      titleLines,
      titleFontSize: fontSize,
      cardsGap: headingRect && gridRect ? gridRect.top - headingRect.bottom : 999,
      leftEdgeDelta: headingRect && gridRect ? Math.abs(headingRect.left - gridRect.left) : 999,
      rightEdgeDelta: headingRect && gridRect ? Math.abs(headingRect.right - gridRect.right) : 999,
      actionMidlineDelta: descriptionRect && guideRect
        ? Math.abs((descriptionRect.top + descriptionRect.height / 2) - (guideRect.top + guideRect.height / 2))
        : 999,
    };
  });

  expect(commandContract.menuViewportRatio).toBeGreaterThan(0.94);
  expect(commandContract.gridMenuRatio).toBeGreaterThan(0.88);
  expect(commandContract.minimumPrimaryCardHeight).toBeGreaterThanOrEqual(250);
  expect(commandContract.menuBorderLeftWidth).toBe(0);
  expect(commandContract.menuBorderRightWidth).toBe(0);
  expect(commandContract.headingHeight).toBeGreaterThan(0);
  expect(commandContract.headingHeight).toBeLessThanOrEqual(150);
  expect(commandContract.titleLines).toBeGreaterThan(0);
  expect(commandContract.titleLines).toBeLessThanOrEqual(2.1);
  expect(commandContract.titleFontSize).toBeLessThanOrEqual(50);
  expect(commandContract.cardsGap).toBeGreaterThanOrEqual(-1);
  expect(commandContract.cardsGap).toBeLessThanOrEqual(32);
  expect(commandContract.leftEdgeDelta).toBeLessThanOrEqual(8);
  expect(commandContract.rightEdgeDelta).toBeLessThanOrEqual(8);
  expect(commandContract.actionMidlineDelta).toBeLessThanOrEqual(12);

  const learning = page.locator('details.home-learning-more');
  await expect(learning).not.toHaveAttribute('open', '');
  await expect(learning.getByRole('heading', { name: 'Puzzles', exact: true })).toBeHidden();

  const lowerNavContract = await page.locator('.home-primary-group:not(.home-modes-section)').evaluate((group) => {
    const rail = group.querySelector('.home-learning-grid');
    const details = group.querySelector('.home-learning-more');
    const cards = [...group.querySelectorAll('.home-learning-grid .home-learning-card')];
    const railRect = rail?.getBoundingClientRect();
    const detailsRect = details?.getBoundingClientRect();

    return {
      cardCount: cards.length,
      flexDirections: cards.map((card) => getComputedStyle(card).flexDirection),
      clippedPixels: cards.map((card) => Math.max(0, card.scrollHeight - card.clientHeight)),
      overflows: cards.map((card) => getComputedStyle(card).overflowY),
      headings: cards.map((card) => card.querySelector('h3')?.textContent?.trim() || ''),
      headingHeights: cards.map((card) => card.querySelector('h3')?.getBoundingClientRect().height || 0),
      kickerDisplays: cards.map((card) => getComputedStyle(card.querySelector('.home-mode-kicker')).display),
      detailsAfterRail: Boolean(railRect && detailsRect && detailsRect.top >= railRect.bottom - 1),
    };
  });

  expect(lowerNavContract.cardCount).toBe(3);
  expect(lowerNavContract.flexDirections).toEqual(['row', 'row', 'row']);
  expect(Math.max(...lowerNavContract.clippedPixels)).toBeLessThanOrEqual(1);
  expect(lowerNavContract.overflows.every((value) => value !== 'hidden')).toBe(true);
  expect(lowerNavContract.headings).toEqual(['Así juegas', 'Entrena tus mayores errores', 'Escuela de Matthias']);
  expect(Math.min(...lowerNavContract.headingHeights)).toBeGreaterThan(0);
  expect(lowerNavContract.kickerDisplays.every((value) => value !== 'none')).toBe(true);
  expect(lowerNavContract.detailsAfterRail).toBe(true);

  await learning.getByText('Más aprendizaje y herramientas', { exact: true }).click();
  await expect(learning).toHaveAttribute('open', '');
  await expect(learning.getByRole('heading', { name: 'Puzzles', exact: true })).toBeVisible();

  const toolContract = await learning.evaluate((details) => {
    const toolCards = [...details.querySelectorAll('.home-tools-grid .home-tool-card')];
    const practiceHeading = toolCards
      .map((card) => card.querySelector('h3'))
      .find((heading) => heading?.textContent?.trim() === 'Partida de práctica');
    const practiceStyle = practiceHeading ? getComputedStyle(practiceHeading) : null;
    const practiceLineHeight = practiceStyle ? Number.parseFloat(practiceStyle.lineHeight) : 0;
    const practiceLines = practiceHeading && practiceLineHeight > 0
      ? practiceHeading.getBoundingClientRect().height / practiceLineHeight
      : 0;

    return {
      toolCopyRatios: toolCards.map((card) => {
        const copy = card.querySelector('.home-mode-copy');
        if (!copy) return 0;
        const cardWidth = card.getBoundingClientRect().width;
        return cardWidth > 0 ? copy.getBoundingClientRect().width / cardWidth : 0;
      }),
      practiceLines,
    };
  });

  expect(Math.min(...toolContract.toolCopyRatios)).toBeGreaterThan(0.78);
  expect(toolContract.practiceLines).toBeGreaterThan(0);
  expect(toolContract.practiceLines).toBeLessThanOrEqual(2.1);

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