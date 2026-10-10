import { expect, test } from '@playwright/test';
import { login, mockApi, openMoreGameModes } from './helpers.js';

async function dismissGuide(page) {
  const guide = page.getByRole('region', { name: 'Guía rápida de Chess Studio' });
  if (!(await guide.isVisible().catch(() => false))) return;

  const dismiss = guide.getByRole('button', { name: 'Ahora no', exact: true });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
    return;
  }

  const close = guide.getByRole('button', { name: 'Cerrar guía rápida', exact: true });
  if (await close.isVisible().catch(() => false)) await close.click();
}

async function openExperimentsHub(page) {
  await mockApi(page);
  await login(page);
  await dismissGuide(page);
  const moreModes = await openMoreGameModes(page);
  await moreModes
    .getByRole('button')
    .filter({ hasText: 'Experimentos geniales' })
    .click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
}

async function openChesscom(page) {
  await openExperimentsHub(page);
  await page.getByRole('button', { name: /Chesscom/ }).click();
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
}

test('Chesscom · abre la planta 17 con renderer Babylon real y HUD Dust Veil premium', async ({ page }) => {
  // Babylon real + producción Vite puede tardar bastante en un runner frío. El
  // smoke anterior llegaba a validar la escena y volver al Hangar, pero agotaba
  // 75 s justo al final; 120 s sigue siendo un límite finito sin convertir un
  // fallo de arranque en una espera eterna.
  test.setTimeout(120_000);
  await openChesscom(page);

  const mode = page.locator('[data-chesscom-poc="true"][data-chesscom-renderer="babylon"]');
  await expect(mode).toBeVisible();
  await expect(mode).toHaveAttribute('data-chesscom-visual', 'premium-v1');
  await expect(mode.getByText('OPERACIÓN: DUST VEIL', { exact: true })).toBeVisible();
  await expect(mode.getByText('Kharif Outpost', { exact: true })).toBeVisible();
  await expect(mode.getByText('HK416 (Used)', { exact: true })).toBeVisible();
  await expect(mode.locator('.chesscom-economy strong')).toHaveText(/^(?:3400|3[.\u00a0\u202f ]400) cr$/);

  const host = mode.locator('.chesscom-babylon-host');
  const canvas = host.locator('canvas');
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(host).toHaveAttribute('data-chesscom-units', 'mercenary-premium-v2');
  await expect(host).toHaveAttribute('data-chesscom-fire-stance', 'weapon-muzzle-v1');
  await expect(host).toHaveAttribute('data-chesscom-operator', 'character-art-v4');
  await expect(host).toHaveAttribute('data-chesscom-character-mesh', 'custom-lowpoly-v4');
  await expect(host).toHaveAttribute('data-chesscom-character-materials', 'procedural-pbr-v4');
  await expect(host).toHaveAttribute('data-chesscom-environment', 'environment-art-v4');
  await expect(host).toHaveAttribute('data-chesscom-architecture', 'industrial-architecture-v19');
  await expect(host).toHaveAttribute('data-chesscom-lighting', 'readability-v2');
  await expect(mode.getByText(/BABYLON\.JS \d+\.\d+\.\d+ · GPU PREMIUM V2 · BALLISTICS · UNIT STANCE · CHARACTER ART V4/)).toBeVisible({ timeout: 30_000 });
  await expect(mode.getByText('BABYLON · ERROR', { exact: true })).toHaveCount(0);

  const dieterArt = mode.locator('.chesscom-portrait-art.is-dieter');
  await expect(dieterArt).toBeVisible();
  await expect.poll(() => dieterArt.evaluate((node) => getComputedStyle(node).backgroundImage)).toMatch(/dieter-portrait\.svg/i);
  await expect(mode.locator('.chesscom-weapon-art')).toBeVisible();

  await expect(mode.getByRole('button', { name: 'Mover', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Disparar', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Vigilancia', exact: true })).toBeVisible();
  await expect(mode.getByRole('button', { name: 'Fin de turno', exact: true })).toBeVisible();

  await mode.getByText(/Detalles del arma/).click();
  const fireModes = mode.getByRole('group', { name: 'Modo de disparo' });
  await expect(fireModes.getByRole('button', { name: 'SA', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toBeVisible();
  await expect(fireModes.getByRole('button', { name: 'Auto', exact: true })).toBeVisible();
  await fireModes.getByRole('button', { name: 'Ráfaga', exact: true }).click();
  await expect(fireModes.getByRole('button', { name: 'Ráfaga', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(mode.locator('.chesscom-mission-badge strong')).toHaveText('DISPARAR');

  await mode.locator('.chesscom-squad-card').filter({ hasText: 'Sven' }).click();
  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Ráfaga', exact: true })).toHaveCount(0);
  await expect(mode.getByRole('group', { name: 'Modo de disparo' }).getByRole('button', { name: 'Auto', exact: true })).toBeVisible();

  // El PNG canónico Dust Veil convierte los laterales en overlays y deja
  // Babylon como protagonista sin perder el acceso a las acciones existentes.
  await page.setViewportSize({ width:1600, height:900 });
  await expect(mode).toHaveAttribute('data-chesscom-layout', 'dust-veil-canonical-v1');
  await expect.poll(() => mode.evaluate((node) => {
    const origin = node.getBoundingClientRect();
    const field = node.querySelector('.chesscom-stage-shell')?.getBoundingClientRect();
    const squad = node.querySelector('.chesscom-squad')?.getBoundingClientRect();
    const actions = node.querySelector('.chesscom-actionbar')?.getBoundingClientRect();
    const objectives = node.querySelector('.chesscom-objectives')?.getBoundingClientRect();
    if (!field || !squad || !actions || !objectives) return false;
    return origin.top >= -1 && origin.top <= 2
      && field.width >= window.innerWidth * .95
      && field.height >= window.innerHeight - 2
      && field.bottom <= window.innerHeight + 2
      && squad.bottom >= window.innerHeight - 40
      && squad.bottom <= window.innerHeight + 2
      && actions.bottom >= window.innerHeight - 40
      && actions.bottom <= window.innerHeight + 2
      && objectives.top < origin.top + 160
      && squad.right < actions.left
      && actions.right < window.innerWidth - 260;
  })).toBe(true);
  await expect(mode.getByText('Informe de campo', { exact:true })).toBeVisible();
  await expect(mode.locator('.chesscom-weapon-ammo')).toHaveText('30/30');
  await expect.poll(() => mode.evaluate((node) => {
    const ammo = node.querySelector('.chesscom-weapon-ammo')?.getBoundingClientRect();
    const weapon = node.querySelector('.chesscom-weapon')?.getBoundingClientRect();
    return Boolean(ammo && weapon && ammo.right <= weapon.right - 12);
  })).toBe(true);

  // El renderer ya está caliente: aprovechamos el mismo boot para verificar la
  // arista móvil que el artifact visual detectó (390px de viewport vs 491px de
  // canvas CSS). El scroll interno de la actionbar es válido; el documento no.
  await page.setViewportSize({ width:390, height:844 });
  await expect.poll(() => page.evaluate(() => ({
    viewport:window.innerWidth,
    documentWidth:document.documentElement.scrollWidth,
  }))).toEqual({ viewport:390, documentWidth:390 });
  await expect.poll(() => canvas.evaluate((node) => Math.ceil(node.getBoundingClientRect().width))).toBeLessThanOrEqual(390);
  await expect(mode.locator('.chesscom-operation')).toBeVisible();
  // Compact branding must fit beside the exit, not be clipped by it.
  await expect.poll(() => mode.evaluate((node) => {
    const title = node.querySelector('.chesscom-brand h2')?.getBoundingClientRect();
    const exit = node.querySelector('.chesscom-exit')?.getBoundingClientRect();
    return Boolean(title && exit && title.right <= exit.left - 2);
  })).toBe(true);
  await expect(page.getByRole('button', { name: '← Experimentos', exact: true })).toBeVisible();

  // Reutilizamos el Babylon ya arrancado para comprobar también la salida. El
  // contrato es el mismo que el antiguo tercer test, sin otro login + boot 3D.
  await page.getByRole('button', { name: '← Experimentos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Experimentos geniales', exact: true })).toBeVisible();
  await expect(page.locator('.lab-workshop-map-table strong')).toHaveText('Chesscom');
  await expect(page.locator('.lab-workshop-portal--pawnslug-godot strong')).toHaveText('PAWN SLUG GODOT');
  await expect(page.locator('.lab-workshop-portal--trailblazer strong')).toHaveText('Pawn Trailblazer');
});

test('Chesscom · no hereda el scroll del Hangar al entrar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 });
  await openExperimentsHub(page);

  const card = page.getByRole('button', { name: /Chesscom/ });
  await card.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // The immersive Experimentos room now fits the viewport, so there may be no
  // document scroll to inherit. The contract belongs to Chesscom: regardless of
  // the hub's current scrollability, entering the mode must start at the top.
  await card.evaluate((node) => node.click());
  await expect(page.getByRole('heading', { name: 'CHESSCOM', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const brandTop = await page.getByRole('heading', { name: 'CHESSCOM', exact: true }).evaluate((node) => node.getBoundingClientRect().top);
  expect(brandTop).toBeGreaterThanOrEqual(0);
});
