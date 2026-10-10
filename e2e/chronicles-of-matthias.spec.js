import { expect, test } from '@playwright/test';
import { confirmChroniclesCharacterSetup, login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;
  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openChroniclesSetup(page, options = {}) {
  await mockApi(page, options);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  const experiments = moreModes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await expect(experiments).toBeVisible();
  await experiments.click();
  const descend = page.getByRole('button').filter({ hasText: 'Descender a la cripta' });
  await expect(descend).toBeVisible();
  await descend.click();
  const entry = page.locator('[data-chronicles-save-menu]');
  await expect(entry).toBeVisible();
  await entry.getByRole('button', options.newCampaign
    ? { name: /Nueva campaña/ }
    : { name: 'Nuevo juego', exact: true }).click();
  const setup = page.locator('[data-chronicles-character-setup]');
  await expect(setup).toBeVisible();
  return setup;
}

async function openChronicles(page, options = {}) {
  await openChroniclesSetup(page, options);
  await confirmChroniclesCharacterSetup(page, { newTown: options.newTown === true });
  await expect(page.locator('[data-chronicles="true"]')).toBeVisible();
}

test('Chronicles · nueva campaña crea una partida versionada de Swordhaven sin tocar el juego clásico', async ({ page }) => {
  test.setTimeout(180_000);
  const creationBodies = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/api/chronicles/runs')) return;
    creationBodies.push(request.postDataJSON());
  });
  await openChronicles(page, {
    chroniclesCurrentMapId: 'swordhaven-first-book',
    newCampaign: true,
    newTown: true,
  });
  await expect.poll(() => creationBodies[0]?.mapId, { timeout: 20_000 }).toBe('swordhaven-first-book');
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-first-book');
  await expect(mode.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(1);
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'explore');
  await expect(mode.locator('.chronicles-renderer-error')).toHaveCount(0);
});

test('Chronicles first-person · nueva expedición pide Swordhaven sin alterar Tactics', async ({ page }) => {
  const creationBodies = [];
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith('/api/chronicles/runs')) return;
    creationBodies.push(request.postDataJSON());
  });
  await openChronicles(page, { chroniclesCurrentMapId: 'swordhaven-square', newTown: true });
  await expect.poll(() => creationBodies[0]?.mapId, { timeout: 20_000 })
    .toBe('swordhaven-square');
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-square');
  await expect(mode.locator('[data-chronicles-renderer="three"] canvas')).toHaveCount(1);
});

test('Chronicles · Escape opens and closes the in-game menu while the scene stays fullscreen', async ({ page }) => {
  // Count every attempt to engage browser-native fullscreen, including entry
  // via Experimentos and character setup. Escape must own the game menu instead.
  await page.addInitScript(() => {
    window.__chroniclesFullscreenRequests = 0;
    Element.prototype.requestFullscreen = function requestFullscreen() {
      window.__chroniclesFullscreenRequests += 1;
      return Promise.resolve();
    };
  });
  await openChronicles(page, { chroniclesCurrentMapId: 'swordhaven-square', newTown: true });
  const mode = page.locator('[data-chronicles="true"]');
  const menu = mode.locator('details.chronicles-game-menu');
  await expect(menu).not.toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.__chroniclesFullscreenRequests)).toBe(0);

  const bounds = await mode.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds?.width || 0).toBeGreaterThanOrEqual((viewport?.width || 0) - 2);
  expect(bounds?.height || 0).toBeGreaterThanOrEqual((viewport?.height || 0) - 2);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('open', '');
  await expect(mode).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(mode).toBeVisible();
  expect(await page.evaluate(() => window.__chroniclesFullscreenRequests)).toBe(0);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('open', '');
  await menu.getByRole('button', { name: 'Salir y guardar' }).click();
  await expect(mode).toHaveCount(0);
});

test('Chronicles · Swordhaven → cripta → Swordhaven, desde el teclado y sin cerrar la run', async ({ page }) => {
  await openChronicles(page, { chroniclesCurrentMapId: 'swordhaven-square', newTown: true });
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-square');
  // Strafe Q/E changes position but not facing; returning to spawn allows gate travel.
  const turnsBeforeStrafe = Number(await mode.getAttribute('data-chronicles-turns'));
  await page.keyboard.press('q');
  await expect(mode).toHaveAttribute('data-chronicles-turns', String(turnsBeforeStrafe + 1));
  await page.keyboard.press('e');
  await expect(mode).toHaveAttribute('data-chronicles-turns', String(turnsBeforeStrafe + 2));
  // The first-person starter faces north: one backwards step crosses the south gate.
  await page.keyboard.press('ArrowDown');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'crypt-eight-squares', { timeout: 20_000 });
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'explore');
  await expect(mode.locator('[data-chronicles-touch-action="interact"]'))
    .toHaveAttribute('aria-label', 'Regresar a Swordhaven');
  // The virtual return door is exposed to keyboard and mobile touch alike.
  await page.keyboard.press('f');
  await expect(mode).toHaveAttribute('data-chronicles-map-id', 'swordhaven-square', { timeout: 20_000 });
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'explore');
});

test('Chronicles creator · recupera el borrador tras F5 sin confirmar progreso', async ({ page }) => {
  const setup = await openChroniclesSetup(page);
  await setup.getByRole('button', { name: 'Crear PJs', exact: true }).click();

  const name = page.getByRole('textbox', { name: 'Nombre de matthias', exact: true });
  await name.fill('Greta de la Cripta');
  await page.getByRole('button', { name: 'Subir Vigor', exact: true }).click();
  const azizSlot = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Aziz' });
  await azizSlot.click();
  await expect(azizSlot).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  const restored = page.locator('[data-chronicles-character-setup="editor"]');
  await expect(restored).toBeVisible();
  await expect(restored.getByText('Borrador recuperado de esta sesión.', { exact: true })).toBeVisible();
  const restoredAziz = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Aziz' });
  await expect(restoredAziz).toHaveAttribute('aria-pressed', 'true');

  const matthiasSlot = page.locator('.chronicles-character-setup__slots button').filter({ hasText: 'Greta de la Cripta' });
  await matthiasSlot.click();
  await expect(page.getByRole('textbox', { name: 'Nombre de matthias', exact: true })).toHaveValue('Greta de la Cripta');
  await expect(restored.getByText('+1 HP', { exact: true })).toBeVisible();
  await expect(page.locator('[data-chronicles="true"]')).toHaveCount(0);
});

test('Chronicles of Matthias · abre una cripta Three.js real y usa combate posicional de grupo', async ({ page }) => {
  // Software WebGL runners can spend a full minute rasterizing the scene;
  // do not share that budget with the actual combat/XP assertions.
  test.setTimeout(180_000);
  // Deterministic initiative: identical d8 rolls leave authored agility in
  // charge, so Faust acts first once combat starts.
  await page.addInitScript(() => {
    Math.random = () => 0.5;
  });
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const stage = mode.locator('[data-chronicles-renderer="three"]');
  await expect(stage.locator('canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.locator('summary[aria-label="Abrir menú de Chronicles"]')).toBeVisible({ timeout: 30_000 });
  await expect(mode.locator('.chronicles-renderer-error')).toHaveCount(0);

  const viewport = page.viewportSize();
  const rootBox = await mode.boundingBox();
  expect(rootBox?.x ?? 99).toBeLessThanOrEqual(1);
  expect(rootBox?.y ?? 99).toBeLessThanOrEqual(1);
  expect(rootBox?.width || 0).toBeGreaterThanOrEqual((viewport?.width || 0) - 2);
  expect(rootBox?.height || 0).toBeGreaterThanOrEqual((viewport?.height || 0) - 2);
  // Browser-native fullscreen is best-effort; viewport ownership is the gameplay contract.

  // Use the real keyboard gameplay path for hosted WebGL. Chromium's synthetic
  // pointer action can stall while the software renderer owns the main thread,
  // even though the visible button is enabled and stable.
  const hildegard = mode.getByRole('button', { name: 'Seleccionar Hildegard', exact: true });
  await expect(mode).toHaveAttribute('data-chronicles-turns', '0');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true }));
  });
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');
  const hildegardSheet = page.getByRole('dialog', { name: 'Hildegard', exact: true });
  await expect(hildegardSheet).toBeVisible();
  await hildegardSheet.getByRole('button', { name: 'Cerrar ficha', exact: true })
    .evaluate((button) => button.click());
  await expect(hildegardSheet).toHaveCount(0);

  // At the canonical start Hildegard is still one square short of the pawn:
  // prove the keyboard attack path without starting combat yet.
  await page.keyboard.press('Space');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '1');
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'explore');
  await expect(hildegard).toHaveAttribute('aria-pressed', 'true');

  // Advancing one square enters the pawn's engagement radius. The exploration
  // action completes, then Chronicles freezes into the AGI + 1d8 initiative
  // scheduler instead of performing the legacy immediate-retaliation flow.
  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '2');
  await expect(mode).toHaveAttribute('data-chronicles-phase', 'combat');
  await expect(mode).toHaveAttribute('data-chronicles-initiative-die', '1d8');

  // A real damaging attack awards persistent XP. That progression update must
  // not tear down/recreate the Three.js renderer: doing so blanks the viewport.
  const canvas = stage.locator('canvas');
  await canvas.evaluate((node) => {
    node.dataset.chroniclesRendererSentinel = 'stable-before-xp';
  });
  await page.keyboard.press('Space');
  await expect(mode).toHaveAttribute('data-chronicles-turns', '3');
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toHaveAttribute('data-chronicles-renderer-sentinel', 'stable-before-xp');
  await expect(mode.locator('.chronicles-renderer-error')).toHaveCount(0);

  const hpBeforeEnemyHit = Number(await mode.getAttribute('data-party-hp-total'));
  await page.evaluate((hpBefore) => {
    const root = document.querySelector('[data-chronicles="true"]');
    if (!root) throw new Error('Chronicles root missing');
    const partyIds = new Set(['matthias', 'rook', 'bishop', 'knight']);
    // A damage flash is intentionally brief. Remember that it happened rather
    // than requiring a 100ms Playwright poll to catch the same render frame.
    const observeHit = () => {
      if (root.querySelector('.chronicles-party-member[data-damage-hit="true"]')) {
        root.dataset.chroniclesDamageCueObserved = 'true';
      }
    };
    const observer = new MutationObserver(observeHit);
    observer.observe(root, { attributes: true, attributeFilter: ['data-damage-hit'], subtree: true });
    window.__chroniclesDamageCueObserver = observer;
    observeHit();
    const pump = () => {
      if (Number(root.getAttribute('data-party-hp-total') || 0) < hpBefore) {
        window.clearInterval(window.__chroniclesFirstPersonDamagePump);
        window.__chroniclesFirstPersonDamagePump = null;
        return;
      }
      const actorId = root.getAttribute('data-chronicles-initiative-actor') || '';
      if (!partyIds.has(actorId)) return;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true, cancelable: true }));
    };
    window.__chroniclesFirstPersonDamagePump = window.setInterval(pump, 120);
    pump();
  }, hpBeforeEnemyHit);

  await page.waitForFunction((hpBefore) => {
    const root = document.querySelector('[data-chronicles="true"]');
    const hp = Number(root?.getAttribute('data-party-hp-total') || 0);
    return hp < hpBefore && root?.dataset.chroniclesDamageCueObserved === 'true';
  }, hpBeforeEnemyHit, { timeout: 30_000, polling: 100 });

  await page.evaluate(() => {
    if (window.__chroniclesFirstPersonDamagePump) window.clearInterval(window.__chroniclesFirstPersonDamagePump);
    window.__chroniclesFirstPersonDamagePump = null;
    window.__chroniclesDamageCueObserver?.disconnect();
    window.__chroniclesDamageCueObserver = null;
  });
});

test('Chronicles of Matthias · clic en un PJ abre una ficha RPG con retrato authored y pausa el mundo', async ({ page }) => {
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const matthias = mode.getByRole('button', { name: 'Seleccionar Matthias', exact: true });
  const turnsBefore = await mode.getAttribute('data-chronicles-turns');

  await matthias.click();
  const sheet = page.getByRole('dialog', { name: 'Matthias', exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('PROGRESIÓN', { exact: true })).toBeVisible();
  await expect(sheet.getByText('EQUIPO Y OBJETOS', { exact: true })).toBeVisible();
  await expect(sheet.getByText('ATRIBUTOS', { exact: true })).toBeVisible();
  await expect(sheet.getByText('TÉCNICAS Y GRIMORIO', { exact: true })).toBeVisible();

  const portrait = sheet.locator('.chronicles-character-sheet__portrait img');
  await expect(portrait).toBeVisible();
  const authoredPortrait = await portrait.evaluate((image) => (
    image.complete
    && image.naturalWidth >= 128
    && image.naturalHeight >= 128
    && !image.src.startsWith('data:')
  ));
  expect(authoredPortrait).toBe(true);

  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', turnsBefore || '0');

  await sheet.getByRole('button', { name: 'Cerrar ficha', exact: true }).click();
  await expect(sheet).toHaveCount(0);
});

test('Chronicles of Matthias · móvil mantiene party y mandos sin overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);
  const mode = page.locator('[data-chronicles="true"]');
  const modeBox = await mode.boundingBox();
  expect(modeBox?.x ?? 99).toBeLessThanOrEqual(1);
  expect(modeBox?.y ?? 99).toBeLessThanOrEqual(1);
  expect(modeBox?.width || 0).toBeGreaterThanOrEqual(388);
  expect(modeBox?.height || 0).toBeGreaterThanOrEqual(842);
  // Browser-native fullscreen is best-effort; viewport ownership is the gameplay contract.
  await expect(mode.getByRole('button', { name: 'Abrir automapa', exact: true })).toBeVisible();
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();
  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test('Chronicles of Matthias · automapa conserva fullscreen, bloquea input y orienta la flecha del grupo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);

  const mode = page.locator('[data-chronicles="true"]');
  const mapButton = mode.getByRole('button', { name: 'Abrir automapa', exact: true });
  await expect(mapButton).toBeVisible();
  await mapButton.click();

  const automap = page.getByRole('dialog', { name: 'Automapa de Chronicles', exact: true });
  await expect(automap).toBeVisible();
  const marker = automap.locator('[data-chronicles-map-facing]');
  await expect(marker).toHaveCount(1);
  const initialFacing = Number(await marker.getAttribute('data-chronicles-map-facing'));
  expect(initialFacing).toBeGreaterThanOrEqual(0);
  expect(initialFacing).toBeLessThanOrEqual(3);
  expect(await automap.locator('.chronicles-automap__cell').count()).toBeGreaterThan(0);

  const turnsWhileOpen = Number(await mode.getAttribute('data-chronicles-turns'));
  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', String(turnsWhileOpen));

  await page.keyboard.press('Escape');
  await expect(automap).toHaveCount(0);
  await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);

  await page.keyboard.press('d');
  await page.keyboard.press('m');
  await expect(automap).toBeVisible();
  await expect(automap.locator('[data-chronicles-map-facing]')).toHaveAttribute(
    'data-chronicles-map-facing',
    String((initialFacing + 1) % 4),
  );

  const rootBox = await mode.boundingBox();
  expect(rootBox?.width || 0).toBeGreaterThanOrEqual(388);
  expect(rootBox?.height || 0).toBeGreaterThanOrEqual(842);
  // Browser-native fullscreen is best-effort; viewport ownership is the gameplay contract.

  await page.keyboard.press('Escape');
  await expect(automap).toHaveCount(0);
  await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);
});


test('Chronicles of Matthias · móvil apaisado ocupa el viewport y conserva escenario jugable', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });

  const setup = await openChroniclesSetup(page);
  const setupBox = await setup.boundingBox();
  expect(setupBox?.x ?? 99).toBeLessThanOrEqual(1);
  expect(setupBox?.y ?? 99).toBeLessThanOrEqual(1);
  expect(setupBox?.width || 0).toBeGreaterThanOrEqual(842);
  expect(setupBox?.height || 0).toBeGreaterThanOrEqual(388);
  await expect(setup.getByRole('button', { name: 'Entrar con grupo canónico', exact: true })).toBeVisible();

  await confirmChroniclesCharacterSetup(page);
  const mode = page.locator('[data-chronicles="true"]');
  await expect(mode).toBeVisible();
  await expect(mode.locator('[data-chronicles-renderer="three"] canvas')).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByLabel('Controles de la mazmorra')).toBeVisible();

  for (const name of ['Girar a la izquierda', 'Avanzar', 'Atacar', 'Retroceder', 'Girar a la derecha']) {
    await expect(mode.getByRole('button', { name, exact: true })).toBeVisible();
  }

  const stageBox = await mode.locator('.chronicles-stage').boundingBox();
  expect(stageBox?.height || 0).toBeGreaterThanOrEqual(388);
  // Browser-native fullscreen is best-effort; viewport ownership is the gameplay contract.

  const forwardBox = await mode.getByRole('button', { name: 'Avanzar', exact: true }).boundingBox();
  const attackBox = await mode.getByRole('button', { name: 'Atacar', exact: true }).boundingBox();
  const partyBox = await mode.getByRole('button', { name: 'Seleccionar Matthias', exact: true }).boundingBox();
  expect(forwardBox?.width || 0).toBeGreaterThanOrEqual(52);
  expect(forwardBox?.height || 0).toBeGreaterThanOrEqual(52);
  expect(attackBox?.width || 0).toBeGreaterThanOrEqual(72);
  expect(attackBox?.height || 0).toBeGreaterThanOrEqual(72);
  expect(partyBox?.width || 0).toBeGreaterThanOrEqual(44);
  expect(partyBox?.height || 0).toBeGreaterThanOrEqual(44);

  const turnLeft = mode.getByRole('button', { name: 'Girar a la izquierda', exact: true });
  const turnsBeforeHold = Number(await mode.getAttribute('data-chronicles-turns'));
  await turnLeft.dispatchEvent('pointerdown', { pointerId: 17, pointerType: 'touch', button: 0 });
  await page.waitForTimeout(470);
  await turnLeft.dispatchEvent('pointerup', { pointerId: 17, pointerType: 'touch', button: 0 });
  const turnsAfterHold = Number(await mode.getAttribute('data-chronicles-turns'));
  expect(turnsAfterHold - turnsBeforeHold).toBeGreaterThanOrEqual(2);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});


test('Chronicles of Matthias · automap sigue el rumbo real y ESC no abandona el viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openChronicles(page);

  const mode = page.locator('[data-chronicles="true"]');
  const mapButton = mode.getByRole('button', { name: 'Abrir automapa', exact: true });
  await expect(mapButton).toBeVisible();

  const turnsBeforeMap = Number(await mode.getAttribute('data-chronicles-turns'));
  await mapButton.click();

  const automap = page.getByRole('dialog', { name: 'Automapa de Chronicles', exact: true });
  await expect(automap).toBeVisible();
  const marker = automap.locator('.chronicles-automap__party-marker');
  await expect(marker).toHaveCount(1);
  const initialFacing = Number(await marker.getAttribute('data-chronicles-map-facing'));

  await page.keyboard.press('w');
  await expect(mode).toHaveAttribute('data-chronicles-turns', String(turnsBeforeMap));

  await page.keyboard.press('Escape');
  await expect(automap).toHaveCount(0);
  await expect(page.locator('.chronicles-game-menu[open]')).toHaveCount(0);
  // Browser-native fullscreen is best-effort; viewport ownership is the gameplay contract.

  await page.keyboard.press('d');
  await page.keyboard.press('m');
  await expect(automap).toBeVisible();
  const turnedFacing = Number(await marker.getAttribute('data-chronicles-map-facing'));
  expect(turnedFacing).toBe((initialFacing + 1) % 4);

  const rootBox = await mode.boundingBox();
  expect(rootBox?.width || 0).toBeGreaterThanOrEqual(388);
  expect(rootBox?.height || 0).toBeGreaterThanOrEqual(842);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('Chronicles · fallos de red permiten reintentar el libro y regresar desde bootstrap', async ({ page }) => {
  const requests = [];
  await mockApi(page, { chroniclesRunFailureStatus: 503, requestLog: requests });
  let inventoryAttempts = 0;
  // This route overrides only the first inventory request; subsequent GETs
  // fall through to the authoritative test API, with no creation on retry.
  await page.route('http://localhost:4000/api/chronicles/runs', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    inventoryAttempts += 1;
    if (inventoryAttempts === 1) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Temporary catalog outage' }),
      });
    }
    return route.fallback();
  });
  await login(page);
  await dismissGuide(page);
  const modes = await openMoreGameModes(page);
  const experiments = modes.getByRole('button').filter({ hasText: 'Experimentos geniales' });
  await experiments.click();
  await page.getByRole('button').filter({ hasText: 'Descender a la cripta' }).click();

  const menu = page.locator('[data-chronicles-save-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('alert')).toContainText('No se pudo consultar el servidor');
  await menu.getByRole('button', { name: 'Reintentar sincronización' }).click();
  await expect.poll(() => inventoryAttempts).toBe(2);
  await expect(menu.getByRole('alert')).toHaveCount(0);
  expect(requests.filter((r) => r.method === 'POST' && r.path === '/api/chronicles/runs')).toHaveLength(0);

  await menu.getByRole('button', { name: 'Nuevo juego' }).click();
  await confirmChroniclesCharacterSetup(page);
  await expect(page.getByRole('heading', { name: 'No se pudo preparar Chronicles' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a expediciones' }).click();
  await expect(menu).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No se pudo preparar Chronicles' })).toHaveCount(0);
  await expect(menu.getByRole('button', { name: 'Nuevo juego' })).toBeEnabled();
});
